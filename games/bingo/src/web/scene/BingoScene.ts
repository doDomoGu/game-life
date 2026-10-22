import {
  Application,
  Container,
  FillGradient,
  Graphics,
  Sprite,
  Text,
  Texture,
  type Ticker,
} from 'pixi.js';
import { findWinningLine } from '../../lines.js';
import { bingoMeta } from '../../meta.js';

export interface BingoSceneState {
  /** 我的棋盘：长度 25，值为 itemId */
  board: number[] | null;
  /** 已点亮的格子 */
  marked: boolean[] | null;
  itemLabels: readonly string[];
  /** 按揭晓顺序排列的 itemId */
  drawnItemIds: readonly number[];
  currentItemId: number | null;
  winnerUserId: string | null;
}

type Point = { x: number; y: number };

interface TileVisual {
  index: number;
  root: Container;
  base: Graphics;
  glow: Sprite;
  emoji: Sprite;
  ring: Graphics | null;
  center: Point;
  size: number;
  marked: boolean;
}

interface Tween {
  delay: number;
  elapsed: number;
  duration: number;
  ease: (t: number) => number;
  onUpdate: (t: number) => void;
  onDone?: () => void;
}

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  gravity: number;
  spin: number;
  life: number;
  maxLife: number;
  confetti: boolean;
}

interface Bokeh {
  sprite: Sprite;
  speed: number;
  phase: number;
  baseAlpha: number;
}

const SIZE = bingoMeta.gridSize;
const CELL_COUNT = SIZE * SIZE;

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const LABEL_FONT = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

const COLOR = {
  tileTop: 0x1b2c45,
  tileBottom: 0x121f33,
  border: 0x253a55,
  accent: 0x38bdf8,
  accentSoft: 0x7dd3fc,
  violet: 0xa78bfa,
  gold: 0xfbbf24,
  green: 0x4ade80,
  text: 0xe6f2ff,
  muted: 0x8aa4c0,
};

const CONFETTI_COLORS = [COLOR.accent, COLOR.accentSoft, COLOR.violet, COLOR.gold, COLOR.green];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

function createRadialTexture(size: number, stops: Array<[number, string]>): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 2D 画布');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

function createRectTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 12;
  canvas.height = 20;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 2D 画布');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return Texture.from(canvas);
}

/** 把 emoji 画到离屏画布上做成贴图，交给 GPU 批量绘制 */
function createEmojiTexture(char: string, size: number): Texture {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.max(16, Math.round(size * dpr));
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 2D 画布');
  ctx.font = `${Math.round(px * 0.8)}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, px / 2, px / 2 + px * 0.04);
  return Texture.from(canvas);
}

export class BingoScene {
  static async create(
    canvas: HTMLCanvasElement,
    options: { reducedMotion?: boolean } = {},
  ): Promise<BingoScene> {
    const app = new Application();
    await app.init({
      canvas,
      width: 320,
      height: 440,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    return new BingoScene(app, options.reducedMotion ?? false);
  }

  private readonly app: Application;
  private readonly calm: boolean;
  private readonly root = new Container();
  private readonly backdrop = new Container();
  private readonly stageLayer = new Container();
  private readonly boardLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly glowTexture: Texture;
  private readonly sparkTexture: Texture;
  private readonly confettiTexture: Texture;
  private readonly tileFill: FillGradient;
  private readonly tileFillMarked: FillGradient;

  private state: BingoSceneState = {
    board: null,
    marked: null,
    itemLabels: [],
    drawnItemIds: [],
    currentItemId: null,
    winnerUserId: null,
  };

  private width = 0;
  private height = 0;
  private stageHeight = 0;
  private boardTop = 0;
  private cellSize = 0;
  private ballRadius = 0;
  private miniCapacity = 8;

  private boardSignature = '';
  private entrancePlayed = false;

  private tiles: TileVisual[] = [];
  private bokeh: Bokeh[] = [];
  private tweens: Tween[] = [];
  private particles: Particle[] = [];
  private emojiTextures: Texture[] = [];
  private pendingTextures: Texture[] = [];
  private retireTimer: number | null = null;
  private time = 0;

  private ball: Container | null = null;
  private ballGlow: Sprite | null = null;
  private ballEmoji: Sprite | null = null;
  private ballPlaceholder: Text | null = null;
  private stageSubtitle: Text | null = null;
  private miniStrip: Container | null = null;
  private winLayer: Container | null = null;
  private winLine: Graphics | null = null;

  private constructor(app: Application, calm: boolean) {
    this.app = app;
    this.calm = calm;

    this.glowTexture = createRadialTexture(128, [
      [0, 'rgba(255,255,255,1)'],
      [0.35, 'rgba(255,255,255,0.55)'],
      [0.7, 'rgba(255,255,255,0.12)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    this.sparkTexture = createRadialTexture(64, [
      [0, 'rgba(255,255,255,1)'],
      [0.5, 'rgba(255,255,255,0.6)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    this.confettiTexture = createRectTexture();

    this.tileFill = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0.4, y: 1 },
      textureSpace: 'local',
      colorStops: [
        { offset: 0, color: COLOR.tileTop },
        { offset: 1, color: COLOR.tileBottom },
      ],
    });
    this.tileFillMarked = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0.4, y: 1 },
      textureSpace: 'local',
      colorStops: [
        { offset: 0, color: 0x14809f },
        { offset: 1, color: 0x0a4b66 },
      ],
    });

    this.root.addChild(this.backdrop, this.stageLayer, this.boardLayer, this.fxLayer);
    app.stage.addChild(this.root);
    app.ticker.add(this.tick);
  }

  /** 组件按内容宽度布局，画布高度由舞台 + 正方形棋盘决定 */
  static heightFor(width: number): number {
    const w = Math.max(280, Math.round(width));
    return BingoScene.stageHeightFor(w) + 10 + w;
  }

  private static stageHeightFor(width: number): number {
    return Math.round(clamp(width * 0.2, 86, 104));
  }

  resize(width: number): void {
    const w = Math.max(280, Math.round(width));
    if (Math.abs(w - this.width) < 1) return;
    this.width = w;
    this.rebuild();
  }

  setState(next: BingoSceneState): void {
    const prev = this.state;
    const signature = next.board ? next.board.join(',') : '';
    const boardChanged = signature !== this.boardSignature;

    this.state = next;

    if (boardChanged) {
      this.boardSignature = signature;
      this.entrancePlayed = false;
      this.rebuild();
      return;
    }

    if (!this.width) return;

    const newDraw =
      next.currentItemId !== null && next.currentItemId !== prev.currentItemId
        ? next.currentItemId
        : null;
    const matched = newDraw !== null ? this.cellOf(newDraw) : -1;
    const animate = newDraw !== null && !this.calm;

    this.syncShowcase(prev, animate);
    this.syncMarks(prev.marked, animate ? matched : -1);

    if (animate && newDraw !== null) this.playReveal(newDraw, matched);
    if (next.winnerUserId && !prev.winnerUserId) this.celebrate();
  }

  destroy(): void {
    this.app.ticker.remove(this.tick);
    this.disposeContent();
    this.app.destroy({ removeView: false }, { children: true });

    if (this.retireTimer !== null) {
      window.clearTimeout(this.retireTimer);
      this.retireTimer = null;
    }
    for (const texture of this.pendingTextures) {
      if (!texture.destroyed) texture.destroy(true);
    }
    this.pendingTextures = [];
    this.glowTexture.destroy(true);
    this.sparkTexture.destroy(true);
    this.confettiTexture.destroy(true);
    this.tileFill.destroy();
    this.tileFillMarked.destroy();
  }

  // ---------------------------------------------------------------- 场景搭建

  private rebuild(): void {
    if (!this.width) return;
    this.disposeContent();

    const w = this.width;
    this.stageHeight = BingoScene.stageHeightFor(w);
    this.boardTop = this.stageHeight + 10;
    this.height = this.boardTop + w;
    this.app.renderer.resize(w, this.height);

    this.drawBackdrop();
    this.drawShowcase();
    this.drawBoard();
    this.playEntrance();
  }

  private disposeContent(): void {
    for (const layer of [this.backdrop, this.stageLayer, this.boardLayer, this.fxLayer]) {
      for (const child of layer.removeChildren()) child.destroy({ children: true });
    }
    this.retireEmojiTextures();
    this.tiles = [];
    this.bokeh = [];
    this.tweens = [];
    this.particles = [];
    this.ball = null;
    this.ballGlow = null;
    this.ballEmoji = null;
    this.ballPlaceholder = null;
    this.stageSubtitle = null;
    this.miniStrip = null;
    this.winLayer = null;
    this.winLine = null;
  }

  private drawBackdrop(): void {
    const w = this.width;
    const h = this.height;

    const base = new Graphics()
      .roundRect(0, 0, w, h, 26)
      .fill({ color: 0x091223 });
    this.backdrop.addChild(base);

    const topGlow = new Sprite(this.glowTexture);
    topGlow.anchor.set(0.5);
    topGlow.setSize(w * 1.5, h * 0.75);
    topGlow.position.set(w * 0.5, h * 0.04);
    topGlow.tint = 0x1d4ed8;
    topGlow.alpha = 0.45;
    topGlow.blendMode = 'add';
    this.backdrop.addChild(topGlow);

    const bottomGlow = new Sprite(this.glowTexture);
    bottomGlow.anchor.set(0.5);
    bottomGlow.setSize(w * 0.9, w * 0.7);
    bottomGlow.position.set(w * 0.92, h * 0.98);
    bottomGlow.tint = 0x7c3aed;
    bottomGlow.alpha = 0.22;
    bottomGlow.blendMode = 'add';
    this.backdrop.addChild(bottomGlow);

    const tints = [0x38bdf8, 0x6366f1, 0x22d3ee, 0xa78bfa];
    for (let i = 0; i < 10; i++) {
      const sprite = new Sprite(this.glowTexture);
      const size = 40 + Math.random() * 110;
      sprite.anchor.set(0.5);
      sprite.setSize(size, size);
      sprite.position.set(Math.random() * w, Math.random() * h);
      sprite.tint = tints[i % tints.length];
      sprite.blendMode = 'add';
      sprite.alpha = 0.05 + Math.random() * 0.05;
      this.backdrop.addChild(sprite);
      this.bokeh.push({
        sprite,
        speed: 4 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        baseAlpha: sprite.alpha,
      });
    }
  }

  private drawShowcase(): void {
    const w = this.width;
    const h = this.stageHeight;

    const panel = new Graphics()
      .roundRect(0, 0, w, h, 22)
      .fill({ color: 0x101d31, alpha: 0.94 })
      .stroke({ width: 1, color: 0x27405e, alpha: 0.9 });
    this.stageLayer.addChild(panel);

    const radius = Math.min(33, h * 0.36);
    this.ballRadius = radius;
    const cx = radius + 14;
    const cy = h / 2;

    const ball = new Container();
    ball.position.set(cx, cy);
    this.ball = ball;
    this.stageLayer.addChild(ball);

    const glow = new Sprite(this.glowTexture);
    glow.anchor.set(0.5);
    glow.setSize(radius * 4, radius * 4);
    glow.tint = COLOR.accent;
    glow.alpha = 0.28;
    glow.blendMode = 'add';
    this.ballGlow = glow;
    ball.addChild(glow);

    const disc = new Graphics()
      .circle(0, 0, radius)
      .fill({ color: 0x0b2336 })
      .stroke({ width: 2, color: 0x2a6884 });
    ball.addChild(disc);

    const innerRing = new Graphics()
      .circle(0, 0, radius - 5)
      .stroke({ width: 1, color: COLOR.accentSoft, alpha: 0.28 });
    ball.addChild(innerRing);

    const placeholder = new Text({
      text: '?',
      style: {
        fontFamily: LABEL_FONT,
        fontSize: Math.round(radius * 0.9),
        fontWeight: '600',
        fill: 0x416d8a,
      },
    });
    placeholder.anchor.set(0.5);
    this.ballPlaceholder = placeholder;
    ball.addChild(placeholder);

    const textX = cx + radius + 16;
    const title = new Text({
      text: '本轮揭晓',
      style: {
        fontFamily: LABEL_FONT,
        fontSize: 11,
        letterSpacing: 2,
        fill: COLOR.muted,
      },
    });
    title.position.set(textX, h * 0.18);
    this.stageLayer.addChild(title);

    const subtitle = new Text({
      text: '等待房主开奖',
      style: {
        fontFamily: LABEL_FONT,
        fontSize: 15,
        fontWeight: '600',
        fill: COLOR.text,
      },
    });
    subtitle.position.set(textX, h * 0.18 + 18);
    this.stageSubtitle = subtitle;
    this.stageLayer.addChild(subtitle);

    const strip = new Container();
    strip.position.set(textX, h - 30);
    this.miniStrip = strip;
    this.stageLayer.addChild(strip);
    this.miniCapacity = Math.max(3, Math.floor((w - textX - 24) / 28));

    const current = this.state.currentItemId;
    if (current !== null) {
      this.setBallEmoji(this.state.itemLabels[current] ?? '?');
      this.syncStageSubtitle();
    }
    this.syncMiniStrip();
    if (this.state.winnerUserId) this.syncStageSubtitle();
  }

  private drawBoard(): void {
    const size = this.width;
    const framePad = Math.round(clamp(size * 0.024, 9, 14));
    const gap = Math.round(clamp(size * 0.014, 5, 8));
    const cell = (size - framePad * 2 - gap * (SIZE - 1)) / SIZE;
    this.cellSize = cell;

    const halo = new Sprite(this.glowTexture);
    halo.anchor.set(0.5);
    halo.setSize(size * 1.15, size * 1.15);
    halo.position.set(size / 2, size / 2);
    halo.tint = 0x0369a1;
    halo.alpha = 0.16;
    halo.blendMode = 'add';
    this.boardLayer.addChild(halo);

    const board = new Container();
    board.position.set(0, this.boardTop);
    this.boardLayer.addChild(board);

    const frame = new Graphics()
      .roundRect(0, 0, size, size, 24)
      .fill({ color: 0x0b1626, alpha: 0.92 })
      .stroke({ width: 1, color: 0x223752 });
    board.addChild(frame);

    // 连线画在棋子下面，只在缝隙里透出光带，不会盖住图案
    const winLayer = new Container();
    this.winLayer = winLayer;
    board.addChild(winLayer);
    if (this.state.winnerUserId && findWinningLine(this.state.marked ?? [])) {
      const lineGraphic = new Graphics();
      winLayer.addChild(lineGraphic);
      this.winLine = lineGraphic;
      this.strokeWinLine(lineGraphic, 1);
    }

    const boardIds = this.state.board;
    this.tiles = [];

    for (let i = 0; i < CELL_COUNT; i++) {
      const row = Math.floor(i / SIZE);
      const col = i % SIZE;
      const localX = framePad + cell / 2 + col * (cell + gap);
      const localY = framePad + cell / 2 + row * (cell + gap);

      const root = new Container();
      root.position.set(localX, localY);

      const glow = new Sprite(this.glowTexture);
      glow.anchor.set(0.5);
      glow.setSize(cell * 1.9, cell * 1.9);
      glow.tint = COLOR.accent;
      glow.blendMode = 'add';
      glow.alpha = 0;

      const base = new Graphics();
      const emoji = this.emojiSprite(this.state.itemLabels[boardIds?.[i] ?? -1] ?? '?', cell * 0.74);

      root.addChild(glow, base, emoji);
      board.addChild(root);

      const tile: TileVisual = {
        index: i,
        root,
        base,
        glow,
        emoji,
        ring: null,
        center: { x: localX, y: this.boardTop + localY },
        size: cell,
        marked: false,
      };
      this.paintTile(tile, false);
      this.tiles.push(tile);
    }

    for (const tile of this.tiles) {
      const marked = !!this.state.marked?.[tile.index];
      tile.marked = marked;
      this.paintTile(tile, marked);
      tile.emoji.alpha = marked ? 1 : 0.4;
      tile.glow.alpha = marked ? 0.24 : 0;
    }

    const winning = findWinningLine(this.state.marked ?? []);
    if (winning) {
      const inLine = new Set(winning);
      for (const tile of this.tiles) {
        tile.root.alpha = inLine.has(tile.index) ? 1 : 0.45;
        if (inLine.has(tile.index)) {
          tile.glow.alpha = 0.34;
          this.addWinRing(tile);
        }
      }
    }
  }

  private addWinRing(tile: TileVisual): void {
    if (tile.ring) return;
    const size = tile.size;
    const ring = new Graphics()
      .roundRect(-size / 2 + 1.4, -size / 2 + 1.4, size - 2.8, size - 2.8, size * 0.2)
      .stroke({ width: 2.4, color: 0xeaf7ff, alpha: 0.85 });
    ring.blendMode = 'add';
    tile.root.addChild(ring);
    tile.ring = ring;
  }

  private paintTile(tile: TileVisual, marked: boolean): void {
    const corner = tile.size * 0.22;
    tile.base
      .clear()
      .roundRect(-tile.size / 2, -tile.size / 2, tile.size, tile.size, corner)
      .fill(marked ? this.tileFillMarked : this.tileFill)
      .stroke({
        width: marked ? 1.6 : 1,
        color: marked ? COLOR.accent : COLOR.border,
        alpha: marked ? 0.95 : 0.75,
      });
    if (marked) {
      tile.base
        .roundRect(-tile.size / 2 + 2, -tile.size / 2 + 2, tile.size - 4, tile.size * 0.4, corner * 0.8)
        .fill({ color: 0xffffff, alpha: 0.07 });
    }
  }

  // ---------------------------------------------------------------- 状态同步

  private syncShowcase(prev: BingoSceneState, animate: boolean): void {
    if (this.stageSubtitle) this.syncStageSubtitle();

    const current = this.state.currentItemId;
    if (current !== prev.currentItemId) {
      this.setBallEmoji(current === null ? null : (this.state.itemLabels[current] ?? '?'));
      if (animate) this.popBall();
    }
    if (this.state.drawnItemIds.length !== prev.drawnItemIds.length) {
      this.syncMiniStrip();
    }
  }

  private syncStageSubtitle(): void {
    if (!this.stageSubtitle) return;
    const rounds = this.state.drawnItemIds.length;
    const lit = this.state.marked?.filter(Boolean).length ?? 0;
    this.stageSubtitle.text =
      rounds === 0 ? '等待房主开奖' : `第 ${rounds} 轮 · 已亮 ${lit} / ${CELL_COUNT} 格`;
  }

  private syncMarks(prevMarked: boolean[] | null, deferIndex: number): void {
    const marked = this.state.marked;
    if (!marked) return;
    for (const tile of this.tiles) {
      const want = !!marked[tile.index];
      const had = !!prevMarked?.[tile.index];
      if (want === had) continue;
      if (want && tile.index === deferIndex) continue;
      this.setTileMarked(tile, want, want);
    }
  }

  private setTileMarked(tile: TileVisual, marked: boolean, animate: boolean): void {
    if (tile.marked === marked) return;
    tile.marked = marked;
    this.paintTile(tile, marked);

    if (!animate || this.calm) {
      tile.emoji.alpha = marked ? 1 : 0.4;
      tile.glow.alpha = marked ? 0.24 : 0;
      return;
    }

    const baseX = 1;
    tile.glow.alpha = 0.55;
    this.tween(
      300,
      (p) => {
        const shrink = Math.min(p / 0.45, 1);
        const grow = Math.max((p - 0.45) / 0.55, 0);
        const scaleY = p < 0.45 ? 1 - 0.94 * easeOutCubic(shrink) : 0.06 + 0.94 * easeOutBack(grow);
        tile.root.scale.set(baseX, Math.max(scaleY, 0.06));
        tile.emoji.alpha = p < 0.45 ? 0.4 + 0.3 * p : 0.55 + 0.45 * grow;
        tile.glow.alpha = 0.55 - 0.3 * p;
      },
      { onDone: () => {
        tile.root.scale.set(1, 1);
        tile.emoji.alpha = marked ? 1 : 0.4;
        tile.glow.alpha = marked ? 0.24 : 0;
      } },
    );
    if (marked) this.ripple(tile.center.x, tile.center.y, tile.size * 1.05, COLOR.accentSoft, 560);
  }

  // ---------------------------------------------------------------- 开奖表现

  private popBall(): void {
    const ball = this.ball;
    if (!ball) return;

    if (this.ballGlow) {
      this.ballGlow.alpha = 0.65;
      this.tween(520, (p) => {
        if (this.ballGlow) this.ballGlow.alpha = 0.65 - 0.37 * p;
      });
    }

    ball.scale.set(0.62);
    this.tween(440, (p) => ball.scale.set(0.62 + 0.38 * p), { ease: easeOutBack });

    const spot = { x: ball.position.x, y: ball.position.y };
    this.ripple(spot.x, spot.y, this.ballRadius * 2.4, COLOR.accent, 680);
    this.burst(spot.x, spot.y, 10, [COLOR.accentSoft, COLOR.accent], 90);
  }

  private playReveal(itemId: number, cellIndex: number): void {
    const char = this.state.itemLabels[itemId] ?? '?';
    const ball = this.ball;
    if (!ball) return;

    const from = { x: ball.position.x, y: ball.position.y };
    const tile = this.tiles[cellIndex];

    if (!tile) {
      this.burst(from.x, from.y, 16, [COLOR.accentSoft, COLOR.accent], 120);
      return;
    }

    this.flyEmoji(char, from, tile.center, () => {
      this.setTileMarked(tile, true, true);
      this.burst(tile.center.x, tile.center.y, 16, [COLOR.accentSoft, COLOR.text, COLOR.accent], 140);
    });
  }

  private flyEmoji(char: string, from: Point, to: Point, onArrive: () => void): void {
    const size = this.cellSize * 0.72;
    const sprite = this.emojiSprite(char, size);
    const baseScale = sprite.scale.x;
    sprite.position.set(from.x, from.y);
    this.fxLayer.addChild(sprite);

    const control: Point = {
      x: (from.x + to.x) / 2 + (to.y - from.y) * 0.16,
      y: Math.min(from.y, to.y) - 60 - Math.abs(to.x - from.x) * 0.16,
    };

    this.tween(
      640,
      (p) => {
        const t = easeInOutCubic(p);
        const x = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * control.x + t ** 2 * to.x;
        const y = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * control.y + t ** 2 * to.y;
        sprite.position.set(x, y);
        sprite.rotation = Math.sin(t * Math.PI) * 0.3;
        const scale = baseScale * (1 - 0.32 * t);
        sprite.scale.set(scale);
        if (Math.random() < 0.5) this.spark(x, y, 0.8);
      },
      {
        onDone: () => {
          sprite.destroy();
          onArrive();
        },
      },
    );
  }

  private celebrate(): void {
    const line = findWinningLine(this.state.marked ?? []);
    if (!line) return;

    const inLine = new Set(line);
    for (const tile of this.tiles) {
      if (inLine.has(tile.index)) {
        this.addWinRing(tile);
        tile.glow.alpha = 0.6;
        this.tween(900, (p) => {
          tile.glow.alpha = 0.34 + 0.26 * (1 - p);
        });
        this.tween(700, (p) => {
          tile.root.scale.set(1 + 0.05 * Math.sin(p * Math.PI));
        }, { onDone: () => tile.root.scale.set(1, 1) });
        continue;
      }
      const from = tile.root.alpha;
      this.tween(this.calm ? 0 : 600, (p) => {
        tile.root.alpha = from + (0.45 - from) * p;
      });
    }

    if (!this.winLine) {
      this.winLine = new Graphics();
      (this.winLayer ?? this.fxLayer).addChild(this.winLine);
    }
    const graphic = this.winLine;

    if (this.calm) {
      this.strokeWinLine(graphic, 1);
      return;
    }

    this.strokeWinLine(graphic, 0);
    this.tween(700, (p) => this.strokeWinLine(graphic, p), { ease: easeOutCubic });

    const center = this.tiles[12]?.center ?? { x: this.width / 2, y: this.boardTop + this.width / 2 };
    const flash = new Sprite(this.glowTexture);
    flash.anchor.set(0.5);
    flash.setSize(this.width * 1.4, this.width * 1.4);
    flash.position.set(center.x, center.y);
    flash.tint = COLOR.accent;
    flash.blendMode = 'add';
    flash.alpha = 0;
    this.fxLayer.addChild(flash);
    this.tween(900, (p) => {
      flash.alpha = 0.5 * Math.sin(p * Math.PI);
    }, { onDone: () => flash.destroy() });

    this.confetti(110);
  }

  private confetti(count: number): void {
    const w = this.width;
    const top = this.boardTop - 40;
    for (let i = 0; i < count; i++) {
      const sprite = new Sprite(this.confettiTexture);
      sprite.anchor.set(0.5);
      sprite.setSize(4 + Math.random() * 4, 8 + Math.random() * 8);
      sprite.tint = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      sprite.position.set(Math.random() * w, top - Math.random() * 80);
      sprite.rotation = Math.random() * Math.PI;
      this.fxLayer.addChild(sprite);
      this.particles.push({
        sprite,
        vx: (Math.random() - 0.5) * 120,
        vy: 50 + Math.random() * 170,
        gravity: 300,
        spin: (Math.random() - 0.5) * 8,
        life: 0,
        maxLife: 3 + Math.random() * 2,
        confetti: true,
      });
    }
  }

  private strokeWinLine(graphic: Graphics, progress: number): void {
    const line = findWinningLine(this.state.marked ?? []);
    if (!line) return;
    const start = this.tiles[line[0]]?.center;
    const end = this.tiles[line[line.length - 1]]?.center;
    if (!start || !end) return;

    const x0 = start.x;
    const y0 = start.y - this.boardTop;
    const x1 = end.x;
    const y1 = end.y - this.boardTop;
    const x = x0 + (x1 - x0) * progress;
    const y = y0 + (y1 - y0) * progress;

    graphic.clear();
    graphic.moveTo(x0, y0).lineTo(x, y).stroke({ width: 18, color: COLOR.accent, alpha: 0.3 });
    graphic.moveTo(x0, y0).lineTo(x, y).stroke({ width: 5, color: 0xdff3ff, alpha: 0.9 });
  }

  // ---------------------------------------------------------------- 粒子与动效

  private ripple(x: number, y: number, maxRadius: number, color: number, duration: number): void {
    const base = 10;
    const graphic = new Graphics()
      .circle(0, 0, base)
      .stroke({ width: 2, color, alpha: 0.65 });
    graphic.position.set(x, y);
    this.fxLayer.addChild(graphic);
    this.tween(
      duration,
      (p) => {
        graphic.scale.set(1 + (maxRadius / base - 1) * easeOutCubic(p));
        graphic.alpha = 0.65 * (1 - p);
      },
      { onDone: () => graphic.destroy() },
    );
  }

  private burst(x: number, y: number, count: number, colors: number[], speed = 120): void {
    for (let i = 0; i < count; i++) {
      const sprite = new Sprite(this.sparkTexture);
      sprite.anchor.set(0.5);
      const size = 6 + Math.random() * 10;
      sprite.setSize(size, size);
      sprite.tint = colors[Math.floor(Math.random() * colors.length)];
      sprite.blendMode = 'add';
      sprite.position.set(x, y);
      this.fxLayer.addChild(sprite);
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.5 + Math.random());
      this.particles.push({
        sprite,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 40,
        gravity: 150,
        spin: (Math.random() - 0.5) * 5,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.45,
        confetti: false,
      });
    }
  }

  private spark(x: number, y: number, scale: number): void {
    const sprite = new Sprite(this.sparkTexture);
    sprite.anchor.set(0.5);
    sprite.setSize(14 * scale, 14 * scale);
    sprite.tint = COLOR.accentSoft;
    sprite.blendMode = 'add';
    sprite.position.set(x, y);
    this.fxLayer.addChild(sprite);
    this.particles.push({
      sprite,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20,
      gravity: 0,
      spin: 0,
      life: 0,
      maxLife: 0.32,
      confetti: false,
    });
  }

  private tween(
    duration: number,
    onUpdate: (t: number) => void,
    options: { delay?: number; ease?: (t: number) => number; onDone?: () => void } = {},
  ): void {
    if (duration <= 0) {
      onUpdate(1);
      options.onDone?.();
      return;
    }
    this.tweens.push({
      delay: options.delay ?? 0,
      elapsed: 0,
      duration,
      ease: options.ease ?? ((t) => t),
      onUpdate,
      onDone: options.onDone,
    });
  }

  private playEntrance(): void {
    if (!this.tiles.length || this.entrancePlayed) return;
    this.entrancePlayed = true;
    if (this.calm) return;

    this.tiles.forEach((tile, i) => {
      tile.root.scale.set(0.55);
      tile.root.alpha = 0;
      this.tween(420, (p) => {
        tile.root.scale.set(0.55 + 0.45 * p);
        tile.root.alpha = Math.min(1, p * 2);
      }, { delay: i * 20, ease: easeOutBack });
    });
  }

  private readonly tick = (ticker: Ticker): void => {
    const dt = Math.min(ticker.deltaMS, 50);
    this.time += dt;

    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tween = this.tweens[i];
      if (tween.delay > 0) {
        tween.delay -= dt;
        continue;
      }
      tween.elapsed += dt;
      const raw = Math.min(tween.elapsed / tween.duration, 1);
      tween.onUpdate(tween.ease(raw));
      if (raw >= 1) {
        this.tweens.splice(i, 1);
        tween.onDone?.();
      }
    }

    const seconds = dt / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life += seconds;
      const progress = particle.life / particle.maxLife;
      if (progress >= 1) {
        particle.sprite.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      particle.vy += particle.gravity * seconds;
      particle.sprite.x += particle.vx * seconds;
      particle.sprite.y += particle.vy * seconds;
      particle.sprite.rotation += particle.spin * seconds;
      particle.sprite.alpha = particle.confetti
        ? Math.min(1, (1 - progress) * 2.5)
        : 1 - progress;
    }

    for (const bokeh of this.bokeh) {
      bokeh.sprite.y += bokeh.speed * seconds;
      if (bokeh.sprite.y > this.height + 80) bokeh.sprite.y = -80;
      bokeh.sprite.alpha =
        bokeh.baseAlpha + Math.sin(this.time * 0.0008 + bokeh.phase) * 0.02;
    }
  };

  // ---------------------------------------------------------------- 工具

  private emojiSprite(char: string, size: number): Sprite {
    const texture = createEmojiTexture(char, size);
    this.emojiTextures.push(texture);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.setSize(size, size);
    return sprite;
  }

  /**
   * 贴图可能还在当前帧的 BindGroup 里，立刻销毁会让 Pixi 刷警告；
   * 所以先排队，几帧之后再释放。
   */
  private retireEmojiTextures(): void {
    if (!this.emojiTextures.length) return;
    this.pendingTextures.push(...this.emojiTextures);
    this.emojiTextures = [];
    if (this.retireTimer !== null) return;
    this.retireTimer = window.setTimeout(() => {
      this.retireTimer = null;
      for (const texture of this.pendingTextures) {
        if (!texture.destroyed) texture.destroy(true);
      }
      this.pendingTextures = [];
    }, 120);
  }

  private setBallEmoji(char: string | null): void {
    const ball = this.ball;
    if (!ball) return;

    if (this.ballEmoji) {
      this.ballEmoji.destroy();
      this.ballEmoji = null;
    }
    if (this.ballPlaceholder) this.ballPlaceholder.visible = char === null;
    if (char === null) return;

    const sprite = this.emojiSprite(char, this.ballRadius * 1.2);
    ball.addChild(sprite);
    this.ballEmoji = sprite;
  }

  private syncMiniStrip(): void {
    const strip = this.miniStrip;
    if (!strip) return;

    for (const child of strip.removeChildren()) child.destroy({ children: true });

    const ids = this.state.drawnItemIds;
    const history = ids.slice(0, -1).slice(-this.miniCapacity);
    history.forEach((id, i) => {
      const holder = new Container();
      holder.position.set(i * 28, 0);

      const disc = new Graphics()
        .circle(0, 0, 11)
        .fill({ color: 0x14273d })
        .stroke({ width: 1, color: 0x2b4363 });
      const emoji = this.emojiSprite(this.state.itemLabels[id] ?? '?', 14);
      holder.addChild(disc, emoji);
      strip.addChild(holder);

      if (i === history.length - 1 && !this.calm) {
        holder.scale.set(0);
        this.tween(260, (p) => holder.scale.set(p), { ease: easeOutBack });
      }
    });
  }

  private cellOf(itemId: number): number {
    return this.state.board?.indexOf(itemId) ?? -1;
  }
}
