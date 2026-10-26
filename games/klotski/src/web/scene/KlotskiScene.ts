import { Application, Container, FillGradient, Graphics, Text } from 'pixi.js';
import { COLS, dragPiece, EXIT, ROWS, type Piece } from '../../board.js';
import { LEVELS, type KlotskiLevel } from '../../levels.js';

export type KlotskiPhase = 'pick' | 'play' | 'done';

export interface KlotskiSceneState {
  phase: KlotskiPhase;
  levelName: string;
  pieces: Piece[];
  steps: number;
  clockText: string;
  submitting: boolean;
  submitError: string;
  showReplay: boolean;
}

export interface KlotskiSceneHandlers {
  onPick: (level: KlotskiLevel) => void;
  onPlace: (id: string, x: number, y: number) => void;
  onUndo: () => void;
  onReset: () => void;
  onReplay: () => void;
}

const FONT = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

const COLOR = {
  wood: 0x3a291c,
  exit: 0xf0c36a,
  cream: 0xf6f1e4,
  ink: 0x2c1b08,
  key: 0x172033,
};

const VERTICAL_COLORS = [0x243e73, 0x1e6b45, 0x5b3d8a, 0x8a4b22];
const HORIZONTAL_COLORS = [0xc8962e, 0xb45309, 0x7c3a2d];
const CAO_COLOR = 0x8e2a2a;
const SOLDIER_COLOR = 0x8a7048;

function pieceFill(piece: Piece) {
  if (piece.kind === 'cao') return CAO_COLOR;
  if (piece.kind === 'soldier') return SOLDIER_COLOR;
  const order = Number(piece.id.slice(1)) || 0;
  return piece.w === 2 ? HORIZONTAL_COLORS[order % HORIZONTAL_COLORS.length] : VERTICAL_COLORS[order % VERTICAL_COLORS.length];
}

function paintPiece(g: Graphics, piece: Piece, cell: number, fill: number) {
  const width = piece.w * cell;
  const height = piece.h * cell;
  const inset = 4;
  g.roundRect(inset, inset, width - inset * 2, height - inset * 2, 14)
    .fill(fill)
    .stroke({ width: 2, color: 0xf6e7c1, alpha: 0.9 });
  const radius = Math.min(width, height) * (piece.kind === 'cao' ? 0.2 : 0.16);
  const cx = width / 2;
  const cy = piece.kind === 'soldier' ? height * 0.4 : height * 0.36;
  g.circle(cx, cy, radius).fill(0xf0c9a0);
  g.circle(cx - radius * 0.34, cy - radius * 0.08, Math.max(1.5, radius * 0.08)).fill(0x1c140c);
  g.circle(cx + radius * 0.34, cy - radius * 0.08, Math.max(1.5, radius * 0.08)).fill(0x1c140c);
  if (piece.kind === 'cao') {
    g.moveTo(cx - radius, cy - radius * 0.55)
      .lineTo(cx - radius * 0.45, cy - radius * 1.65)
      .lineTo(cx, cy - radius * 0.85)
      .lineTo(cx + radius * 0.45, cy - radius * 1.65)
      .lineTo(cx + radius, cy - radius * 0.55)
      .closePath()
      .fill(0xf0c36a);
    g.roundRect(cx - radius * 0.4, cy + radius * 0.35, radius * 0.8, radius * 0.85, radius * 0.3).fill(0x1c140c);
  } else if (piece.kind === 'general') {
    g.roundRect(cx - radius * 0.95, cy - radius * 1.35, radius * 1.9, radius * 0.62, 4).fill(0x2a2118);
    g.roundRect(cx - radius * 0.35, cy + radius * 0.4, radius * 0.7, radius * 0.7, radius * 0.25).fill(0x1c140c);
  } else {
    g.roundRect(cx - radius * 0.8, cy - radius * 1.2, radius * 1.6, radius * 0.45, 3).fill(0x3a2e22);
  }
}

export class KlotskiScene {
  static heightFor(width: number, phase: KlotskiPhase): number {
    if (phase === 'pick') return 44 + Math.ceil(LEVELS.length / 2) * 72;
    const cell = width / COLS;
    if (phase === 'done') return 36 + cell * ROWS + 148;
    return 36 + cell * ROWS + 96;
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
    pieces: [],
    steps: 0,
    clockText: '',
    submitting: false,
    submitError: '',
    showReplay: false,
  };
  private handlers: KlotskiSceneHandlers = {
    onPick: () => undefined,
    onPlace: () => undefined,
    onUndo: () => undefined,
    onReset: () => undefined,
    onReplay: () => undefined,
  };
  private width = 320;
  private built = '';
  private drag: { id: string; grabX: number; grabY: number } | null = null;

  private constructor(app: Application) {
    this.app = app;
    this.gold = new FillGradient({
      colorStops: [
        { offset: 0, color: 0xffe7ad },
        { offset: 1, color: 0xe2ae4a },
      ],
    });
    app.stage.addChild(this.root);
  }

  setHandlers(handlers: KlotskiSceneHandlers) {
    this.handlers = handlers;
  }

  setState(state: KlotskiSceneState) {
    this.state = state;
    const key = `${state.phase}:${this.width}:${state.levelName}:${state.submitting}:${state.submitError}:${state.showReplay}`;
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
    this.clearRoot();
    this.app.destroy({ removeView: false }, { children: true });
  }

  private clearRoot() {
    const children = this.root.removeChildren();
    for (const child of children) child.destroy({ children: true });
  }

  private rebuild() {
    this.clearRoot();
    this.app.renderer.resize(this.width, KlotskiScene.heightFor(this.width, this.state.phase));
    if (this.state.phase === 'pick') this.drawPick();
    else this.drawBoard();
  }

  private refresh() {
    if (this.state.phase === 'pick') return;
    const header = this.root.getChildByLabel('clock');
    if (header instanceof Text) header.text = this.headerText();
    const board = this.root.getChildByLabel('board');
    if (!board) return;
    for (const piece of this.state.pieces) {
      if (piece.id === this.drag?.id) continue;
      const view = board.getChildByLabel(piece.id);
      if (!view) continue;
      view.position.set(piece.x * this.cell, piece.y * this.cell);
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
      const button = this.button(colW, 56, level.name, true);
      button.position.set((index % 2) * (colW + 10), 44 + Math.floor(index / 2) * 72);
      button.on('pointertap', () => this.handlers.onPick(level));
      this.root.addChild(button);
    });
  }

  private drawBoard() {
    const header = new Text({
      text: this.headerText(),
      style: { fontFamily: FONT, fontSize: 16, fontWeight: '700', fill: COLOR.cream },
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

    if (this.state.phase === 'play') {
      const undo = this.button(this.width / 2 - 6, 48, '撤销', false);
      const reset = this.button(this.width / 2 - 6, 48, '重来', false);
      undo.position.set(0, 32 + cell * ROWS + 36);
      reset.position.set(this.width / 2 + 6, 32 + cell * ROWS + 36);
      undo.on('pointertap', () => {
        if (!this.drag) this.handlers.onUndo();
      });
      reset.on('pointertap', () => {
        if (!this.drag) this.handlers.onReset();
      });
      this.root.addChild(undo, reset);
      return;
    }

    const done = new Text({
      text: this.state.submitting ? '正在保存…' : `过关 · ${this.state.steps} 步`,
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
    const fill = pieceFill(piece);
    paintPiece(bg, piece, cell, fill);
    const label = new Text({
      text: piece.name,
      style: {
        fontFamily: FONT,
        fontSize: piece.kind === 'soldier' ? 13 : 15,
        fontWeight: '800',
        fill: fill === HORIZONTAL_COLORS[0] ? COLOR.ink : COLOR.cream,
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set((piece.w * cell) / 2, piece.h * cell - 8);
    root.addChild(bg, label);
    if (this.state.phase !== 'play') return root;
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.on('pointerdown', (event) => {
      if (!root.parent) return;
      const local = root.parent.toLocal(event.global);
      this.drag = { id: piece.id, grabX: local.x - root.position.x, grabY: local.y - root.position.y };
    });
    root.on('globalpointermove', (event) => {
      if (this.drag?.id !== piece.id || !root.parent) return;
      const local = root.parent.toLocal(event.global);
      const towardX = Math.round((local.x - this.drag.grabX) / cell);
      const towardY = Math.round((local.y - this.drag.grabY) / cell);
      const next = dragPiece(this.state.pieces, piece.id, towardX, towardY);
      root.position.set(next.x * cell, next.y * cell);
    });
    const finish = () => {
      if (this.drag?.id !== piece.id) return;
      const x = Math.round(root.position.x / cell);
      const y = Math.round(root.position.y / cell);
      const current = this.state.pieces.find((item) => item.id === piece.id);
      this.drag = null;
      if (current && (x !== current.x || y !== current.y)) this.handlers.onPlace(piece.id, x, y);
      else if (current) root.position.set(current.x * cell, current.y * cell);
    };
    root.on('pointerup', finish);
    root.on('pointerupoutside', finish);
    return root;
  }

  private headerText() {
    if (this.state.phase === 'done') return `${this.state.levelName}    过关 ${this.state.steps} 步`;
    return `${this.state.levelName}    ${this.state.steps} 步    ${this.state.clockText}`;
  }

  private get cell() {
    return this.width / COLS;
  }

  private button(width: number, height: number, caption: string, gold: boolean) {
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
    label.position.set(width / 2, height / 2);
    root.addChild(bg, label);
    root.eventMode = 'static';
    root.cursor = 'pointer';
    return root;
  }
}
