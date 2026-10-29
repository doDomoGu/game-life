import { Application, Container, FillGradient, Graphics, Text } from 'pixi.js';
import { COLS, dragGroup, EXIT, ROWS, type Piece, type PieceMove } from '../../board.js';
import { LEVELS, type KlotskiLevel } from '../../levels.js';

export type KlotskiPhase = 'pick' | 'play' | 'demo' | 'done';
export type KlotskiDemoStatus = 'solving' | 'running' | 'finished';

export interface KlotskiSceneState {
  phase: KlotskiPhase;
  levelName: string;
  minSteps: number;
  pieces: Piece[];
  steps: number;
  clockText: string;
  submitting: boolean;
  submitError: string;
  showReplay: boolean;
  demoStatus: KlotskiDemoStatus;
}

export interface KlotskiSceneHandlers {
  onPick: (level: KlotskiLevel) => void;
  onPlace: (id: string, moves: PieceMove[], steps: number) => void;
  onUndo: () => void;
  onReset: () => void;
  onReplay: () => void;
  onDemo: () => void;
  onStopDemo: () => void;
}

const FONT = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

const COLOR = {
  wood: 0x3a291c,
  exit: 0xf0c36a,
  cream: 0xf6f1e4,
  ink: 0x2c1b08,
  key: 0x172033,
};

interface PieceLook {
  robe: number;
  robeLight: number;
  trim: number;
  face: number;
  hair: number;
  beard: 'long' | 'wide' | 'short' | 'white' | 'none';
  hat: 'crown' | 'helmet' | 'cap' | 'plume';
  labelDark: boolean;
}

function lookOf(piece: Piece): PieceLook {
  switch (piece.name) {
    case '曹操':
      return { robe: 0x8e1d1d, robeLight: 0xc44545, trim: 0xe8c56b, face: 0xf0c9a0, hair: 0x1a120c, beard: 'short', hat: 'crown', labelDark: false };
    case '关羽':
      return { robe: 0x1b6a38, robeLight: 0x2f9a55, trim: 0xd4a24a, face: 0xe8a090, hair: 0x1a120c, beard: 'long', hat: 'cap', labelDark: false };
    case '张飞':
      return { robe: 0x241e18, robeLight: 0x4a4034, trim: 0xc4a46a, face: 0xd7a882, hair: 0x1a120c, beard: 'wide', hat: 'helmet', labelDark: false };
    case '赵云':
      return { robe: 0xd5dbe6, robeLight: 0xf7f9fc, trim: 0x9aa6b8, face: 0xf3d2b0, hair: 0x24180f, beard: 'none', hat: 'plume', labelDark: true };
    case '马超':
      return { robe: 0xf2eee3, robeLight: 0xfffaf2, trim: 0xc9a15b, face: 0xf0c9a0, hair: 0x24180f, beard: 'short', hat: 'helmet', labelDark: true };
    case '黄忠':
      return { robe: 0xa86b2a, robeLight: 0xd4924a, trim: 0xf0d7a0, face: 0xe8c4a4, hair: 0x8a8a8a, beard: 'white', hat: 'cap', labelDark: false };
    default:
      return { robe: 0x8a7048, robeLight: 0xb08a5c, trim: 0xe6d2a4, face: 0xf0c9a0, hair: 0x3a2e22, beard: 'none', hat: 'helmet', labelDark: false };
  }
}

function paintPiece(g: Graphics, piece: Piece, cell: number) {
  const look = lookOf(piece);
  const width = piece.w * cell;
  const height = piece.h * cell;
  const inset = 3;
  const wood = new FillGradient({
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: 0x6a4a2c },
      { offset: 1, color: 0x2c1c12 },
    ],
  });
  const lacquer = new FillGradient({
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: look.robeLight },
      { offset: 1, color: look.robe },
    ],
  });
  g.roundRect(inset, inset, width - inset * 2, height - inset * 2, 12).fill(wood);
  g.roundRect(inset + 4, inset + 4, width - inset * 2 - 8, height - inset * 2 - 8, 9)
    .fill(lacquer)
    .stroke({ width: 1.5, color: look.trim, alpha: 0.95 });

  const radius = Math.min(width * 0.22, (height - 30) * 0.28);
  const cx = width / 2;
  const cy = Math.min(height * 0.38, height - 36 - radius);
  g.roundRect(cx - radius * 1.25, cy + radius * 0.45, radius * 2.5, radius * 1.45, radius * 0.4).fill(look.robe);
  g.roundRect(cx - radius * 0.85, cy + radius * 0.62, radius * 1.7, radius * 0.28, 3).fill(look.trim);
  g.circle(cx, cy, radius).fill(look.face);
  const eye = Math.max(1.4, radius * 0.08);
  g.circle(cx - radius * 0.32, cy - radius * 0.05, eye).fill(0x1c140c);
  g.circle(cx + radius * 0.32, cy - radius * 0.05, eye).fill(0x1c140c);
  paintHat(g, look, cx, cy, radius);
  paintBeard(g, look, cx, cy, radius);
}

function paintHat(g: Graphics, look: PieceLook, cx: number, cy: number, radius: number) {
  if (look.hat === 'crown') {
    g.moveTo(cx - radius * 1.05, cy - radius * 0.45)
      .lineTo(cx - radius * 0.55, cy - radius * 1.55)
      .lineTo(cx, cy - radius * 0.75)
      .lineTo(cx + radius * 0.55, cy - radius * 1.55)
      .lineTo(cx + radius * 1.05, cy - radius * 0.45)
      .closePath()
      .fill(look.trim);
    return;
  }
  if (look.hat === 'plume') {
    g.roundRect(cx - radius * 0.85, cy - radius * 1.25, radius * 1.7, radius * 0.55, 4).fill(0x243044);
    g.ellipse(cx + radius * 0.15, cy - radius * 1.7, radius * 0.22, radius * 0.7).fill(0xf7f4ea);
    return;
  }
  if (look.hat === 'cap') {
    g.roundRect(cx - radius * 0.95, cy - radius * 1.2, radius * 1.9, radius * 0.48, 4).fill(look.hair);
    g.roundRect(cx - radius * 1.15, cy - radius * 0.82, radius * 2.3, radius * 0.22, 3).fill(look.hair);
    return;
  }
  g.roundRect(cx - radius * 0.78, cy - radius * 1.22, radius * 1.56, radius * 0.58, radius * 0.2).fill(0x3a332c);
  g.roundRect(cx - radius * 0.95, cy - radius * 0.78, radius * 1.9, radius * 0.2, 2).fill(look.trim);
}

function paintBeard(g: Graphics, look: PieceLook, cx: number, cy: number, radius: number) {
  const color = look.beard === 'white' ? 0xe7e2d8 : look.hair;
  if (look.beard === 'none') return;
  if (look.beard === 'long') {
    g.roundRect(cx - radius * 0.42, cy + radius * 0.35, radius * 0.84, radius * 1.55, radius * 0.3).fill(color);
    return;
  }
  if (look.beard === 'wide') {
    g.ellipse(cx, cy + radius * 0.72, radius * 0.85, radius * 0.55).fill(color);
    return;
  }
  g.roundRect(cx - radius * 0.38, cy + radius * 0.32, radius * 0.76, radius * 0.7, radius * 0.25).fill(color);
}

export class KlotskiScene {
  static heightFor(width: number, phase: KlotskiPhase): number {
    if (phase === 'pick') return 44 + Math.ceil(LEVELS.length / 2) * 72;
    const cell = width / COLS;
    if (phase === 'done') return 36 + cell * ROWS + 148;
    return 36 + cell * ROWS + 96;
  }

  static fitWidth(maxWidth: number, maxHeight: number, phase: KlotskiPhase): number {
    const width = Math.max(160, Math.floor(maxWidth));
    if (maxHeight <= 0 || this.heightFor(width, phase) <= maxHeight) return width;
    let low = 160;
    let high = width;
    for (let step = 0; step < 16; step += 1) {
      const mid = Math.floor((low + high) / 2);
      if (this.heightFor(mid, phase) > maxHeight) high = mid;
      else low = mid;
    }
    return low;
  }

  static async create(canvas: HTMLCanvasElement): Promise<KlotskiScene> {
    const app = new Application();
    await app.init({
      canvas,
      width: 320,
      height: 300,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    return new KlotskiScene(app);
  }

  private readonly app: Application;
  private readonly root = new Container();
  private readonly gold: FillGradient;
  private state: KlotskiSceneState = {
    phase: 'pick',
    levelName: '',
    minSteps: 0,
    pieces: [],
    steps: 0,
    clockText: '',
    submitting: false,
    submitError: '',
    showReplay: false,
    demoStatus: 'solving',
  };
  private handlers: KlotskiSceneHandlers = {
    onPick: () => undefined,
    onPlace: () => undefined,
    onUndo: () => undefined,
    onReset: () => undefined,
    onReplay: () => undefined,
    onDemo: () => undefined,
    onStopDemo: () => undefined,
  };
  private width = 320;
  private built = '';
  private readonly targets = new Map<string, { x: number; y: number }>();
  private drag: {
    id: string;
    grabX: number;
    grabY: number;
    moves: PieceMove[];
    traveled: number;
    last: Map<string, { x: number; y: number }>;
  } | null = null;

  private constructor(app: Application) {
    this.app = app;
    this.gold = new FillGradient({
      colorStops: [
        { offset: 0, color: 0xffe7ad },
        { offset: 1, color: 0xe2ae4a },
      ],
    });
    app.stage.addChild(this.root);
    app.ticker.add(this.glide);
  }

  private readonly glide = (ticker: { deltaMS: number }) => {
    if (this.drag || this.targets.size === 0) return;
    const board = this.root.getChildByLabel('board');
    if (!board) return;
    const ease = Math.min(1, ticker.deltaMS / 90);
    for (const [id, target] of this.targets) {
      const view = board.getChildByLabel(id);
      if (!view) {
        this.targets.delete(id);
        continue;
      }
      const dx = target.x - view.position.x;
      const dy = target.y - view.position.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        view.position.set(target.x, target.y);
        this.targets.delete(id);
        continue;
      }
      view.position.set(view.position.x + dx * ease, view.position.y + dy * ease);
    }
  };

  setHandlers(handlers: KlotskiSceneHandlers) {
    this.handlers = handlers;
  }

  setState(state: KlotskiSceneState) {
    this.state = state;
    const demo = state.phase === 'demo' ? state.demoStatus : '';
    const key = `${state.phase}:${demo}:${this.width}:${state.levelName}:${state.submitting}:${state.submitError}:${state.showReplay}`;
    if (key !== this.built) {
      this.drag = null;
      this.built = key;
      this.rebuild();
      return;
    }
    this.refresh();
  }

  resize(width: number) {
    const next = Math.max(240, Math.floor(width));
    if (next === this.width && this.built) return;
    this.width = next;
    this.built = '';
    this.setState(this.state);
  }

  destroy() {
    this.app.ticker.remove(this.glide);
    this.targets.clear();
    this.clearRoot();
    this.app.destroy({ removeView: false }, { children: true });
  }

  private clearRoot() {
    const children = this.root.removeChildren();
    for (const child of children) child.destroy({ children: true });
  }

  private rebuild() {
    this.targets.clear();
    this.clearRoot();
    this.app.renderer.resize(this.width, KlotskiScene.heightFor(this.width, this.state.phase));
    if (this.state.phase === 'pick') this.drawPick();
    else this.drawBoard();
  }

  private refresh() {
    if (this.state.phase === 'pick') return;
    this.syncHeader();
    const board = this.root.getChildByLabel('board');
    if (!board) return;
    for (const piece of this.state.pieces) {
      if (this.drag && (piece.id === this.drag.id || this.drag.moves.some((move) => move.id === piece.id))) continue;
      const view = board.getChildByLabel(piece.id);
      if (!view) continue;
      const x = piece.x * this.cell;
      const y = piece.y * this.cell;
      if (view.position.x !== x || view.position.y !== y) this.targets.set(piece.id, { x, y });
    }
  }

  private drawPick() {
    const title = new Text({
      text: '选择布局',
      style: { fontFamily: FONT, fontSize: 22, fontWeight: '800', fill: COLOR.cream },
    });
    this.root.addChild(title);
    const colW = (this.width - 10) / 2;
    LEVELS.forEach((level, index) => {
      const button = this.button(colW, 56, level.name, true, `最少 ${level.minSteps} 步`);
      button.position.set((index % 2) * (colW + 10), 44 + Math.floor(index / 2) * 72);
      button.on('pointertap', () => this.handlers.onPick(level));
      this.root.addChild(button);
    });
  }

  private drawBoard() {
    const header = new Text({
      text: this.headerText(),
      style: { fontFamily: FONT, fontSize: 15, fontWeight: '700', fill: COLOR.cream },
    });
    header.label = 'clock';
    this.root.addChild(header);

    const cell = this.cell;
    const board = new Container();
    board.label = 'board';
    board.position.set(0, 32);
    const wood = new Graphics();
    wood.roundRect(-8, -8, this.width + 16, cell * ROWS + 16, 16).fill(COLOR.wood);
    wood.roundRect(cell * EXIT.x, cell * EXIT.y, cell * 2, cell * 2, 8).fill({ color: COLOR.exit, alpha: 0.22 });
    board.addChild(wood);
    const exit = new Text({
      text: '出口',
      style: { fontFamily: FONT, fontSize: 14, fontWeight: '700', fill: COLOR.exit },
    });
    exit.anchor.set(0.5, 0);
    exit.position.set(cell * (EXIT.x + 1), cell * ROWS + 10);
    board.addChild(exit);

    for (const piece of this.state.pieces) {
      board.addChild(this.pieceView(piece, cell));
    }
    this.root.addChild(board);

    const barY = 32 + cell * ROWS + 36;
    if (this.state.phase === 'play') {
      const third = (this.width - 16) / 3;
      const undo = this.button(third, 48, '撤销', false);
      const reset = this.button(third, 48, '重来', false);
      const demo = this.button(third, 48, '演示', true);
      undo.position.set(0, barY);
      reset.position.set(third + 8, barY);
      demo.position.set((third + 8) * 2, barY);
      undo.on('pointertap', () => {
        if (!this.drag) this.handlers.onUndo();
      });
      reset.on('pointertap', () => {
        if (!this.drag) this.handlers.onReset();
      });
      demo.on('pointertap', () => {
        if (!this.drag) this.handlers.onDemo();
      });
      this.root.addChild(undo, reset, demo);
      return;
    }

    if (this.state.phase === 'demo') {
      if (this.state.demoStatus === 'finished') {
        const half = this.width / 2 - 6;
        const reset = this.button(half, 48, '自己来', false);
        const pick = this.button(half, 48, '重开一局', true);
        reset.position.set(0, barY);
        pick.position.set(half + 12, barY);
        reset.on('pointertap', () => this.handlers.onReset());
        pick.on('pointertap', () => this.handlers.onReplay());
        this.root.addChild(reset, pick);
        return;
      }
      const stop = this.button(this.width, 48, '停止演示', false);
      stop.position.set(0, barY);
      stop.on('pointertap', () => this.handlers.onStopDemo());
      this.root.addChild(stop);
      return;
    }

    const done = new Text({
      text: this.state.submitting ? '正在保存…' : `过关 · ${this.state.steps} 步（最少 ${this.state.minSteps} 步）`,
      style: { fontFamily: FONT, fontSize: 16, fontWeight: '700', fill: COLOR.cream },
    });
    done.position.set(0, 32 + cell * ROWS + 18);
    this.root.addChild(done);
    if (this.state.submitError) {
      const error = new Text({
        text: this.state.submitError,
        style: { fontFamily: FONT, fontSize: 14, fill: 0xfca5a5 },
      });
      error.position.set(0, done.y + 24);
      this.root.addChild(error);
    }
    if (this.state.showReplay && !this.state.submitting) {
      const replay = this.button(this.width, 48, '重开一局', true);
      replay.position.set(0, 32 + cell * ROWS + (this.state.submitError ? 72 : 48));
      replay.on('pointertap', () => this.handlers.onReplay());
      this.root.addChild(replay);
    }
  }

  private pieceView(piece: Piece, cell: number) {
    const root = new Container();
    root.label = piece.id;
    root.position.set(piece.x * cell, piece.y * cell);
    const bg = new Graphics();
    const look = lookOf(piece);
    paintPiece(bg, piece, cell);
    const label = new Text({
      text: piece.name,
      style: {
        fontFamily: FONT,
        fontSize: piece.kind === 'soldier' ? 13 : 15,
        fontWeight: '800',
        fill: look.labelDark ? COLOR.ink : COLOR.cream,
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set((piece.w * cell) / 2, piece.h * cell - 8);
    root.addChild(bg, label);
    if (this.state.phase !== 'play') return root;
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.on('pointerdown', (event) => {
      if (this.drag || !root.parent) return;
      const local = root.parent.toLocal(event.global);
      this.drag = {
        id: piece.id,
        grabX: local.x - root.position.x,
        grabY: local.y - root.position.y,
        moves: [],
        traveled: 0,
        last: new Map(this.state.pieces.map((item) => [item.id, { x: item.x, y: item.y }])),
      };
    });
    root.on('globalpointermove', (event) => {
      if (this.drag?.id !== piece.id || !root.parent) return;
      const local = root.parent.toLocal(event.global);
      const towardX = Math.round((local.x - this.drag.grabX) / cell);
      const towardY = Math.round((local.y - this.drag.grabY) / cell);
      const moves = dragGroup(this.state.pieces, piece.id, towardX, towardY);
      this.drag.moves = moves;
      for (const item of this.state.pieces) {
        const view = root.parent.getChildByLabel(item.id);
        if (!view) continue;
        const move = moves.find((candidate) => candidate.id === item.id);
        const x = move?.x ?? item.x;
        const y = move?.y ?? item.y;
        const previous = this.drag.last.get(item.id) ?? { x: item.x, y: item.y };
        this.drag.traveled += Math.abs(x - previous.x) + Math.abs(y - previous.y);
        this.drag.last.set(item.id, { x, y });
        view.position.set(x * cell, y * cell);
      }
      this.syncHeader();
    });
    const finish = () => {
      if (this.drag?.id !== piece.id || !root.parent) return;
      const moves = this.drag.moves;
      const steps = this.drag.traveled;
      const changed = moves.some((move) => {
        const current = this.state.pieces.find((item) => item.id === move.id);
        return current && (current.x !== move.x || current.y !== move.y);
      });
      this.drag = null;
      this.syncHeader();
      if (changed && steps > 0) this.handlers.onPlace(piece.id, moves, steps);
      else {
        for (const item of this.state.pieces) {
          const view = root.parent.getChildByLabel(item.id);
          view?.position.set(item.x * cell, item.y * cell);
        }
      }
    };
    root.on('pointerup', finish);
    root.on('pointerupoutside', finish);
    return root;
  }

  private syncHeader() {
    const header = this.root.getChildByLabel('clock');
    if (header instanceof Text) header.text = this.headerText();
  }

  private headerText() {
    const { levelName, minSteps, phase, demoStatus } = this.state;
    const steps = this.state.steps + (this.drag?.traveled ?? 0);
    if (phase === 'done') return `${levelName}   过关 ${steps} 步 · 最少 ${minSteps}`;
    if (phase === 'demo') {
      if (demoStatus === 'solving') return `${levelName}   正在计算解法…`;
      if (demoStatus === 'finished') return `${levelName}   演示完成 · ${steps} 步`;
      return `${levelName}   演示 ${steps} / ${minSteps} 步`;
    }
    return `${levelName}   ${steps} 步 · 最少 ${minSteps}   ${this.state.clockText}`;
  }

  private get cell() {
    return this.width / COLS;
  }

  private button(width: number, height: number, caption: string, gold: boolean, note?: string) {
    const root = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, width, height, 14).fill(gold ? this.gold : COLOR.key);
    const label = new Text({
      text: caption,
      style: {
        fontFamily: FONT,
        fontSize: 18,
        fontWeight: '800',
        fill: gold ? COLOR.ink : COLOR.cream,
      },
    });
    label.anchor.set(0.5);
    label.position.set(width / 2, note ? height / 2 - 8 : height / 2);
    root.addChild(bg, label);
    if (note) {
      const sub = new Text({
        text: note,
        style: { fontFamily: FONT, fontSize: 12, fontWeight: '600', fill: gold ? 0x6b4a1c : COLOR.cream },
      });
      sub.anchor.set(0.5);
      sub.position.set(width / 2, height / 2 + 12);
      root.addChild(sub);
    }
    root.eventMode = 'static';
    root.cursor = 'pointer';
    return root;
  }
}
