import { Application, Container, FillGradient, Graphics, Text } from 'pixi.js';
import { DIFFICULTIES, hasConflict, isDigitComplete, type Difficulty } from '../../sudoku.js';

export type SudokuPhase = 'pick' | 'generating' | 'play' | 'done';

export interface SudokuSceneState {
  phase: SudokuPhase;
  values: number[];
  notes: number[][];
  givens: boolean[];
  selected: number;
  draftMode: boolean;
  difficultyLabel: string;
  clockText: string;
  submitting: boolean;
  submitError: string;
  showReplay: boolean;
}

export interface SudokuSceneHandlers {
  onPick: (difficulty: Difficulty) => void;
  onSelect: (index: number) => void;
  onDigit: (value: number) => void;
  onToggleDraft: () => void;
  onReplay: () => void;
}

const FONT = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

const COLOR = {
  paper: 0xf6f0e4,
  paperPeer: 0xe7f2ea,
  paperSame: 0xd5eadc,
  paperSelected: 0xf0c36a,
  paperConflict: 0xfecaca,
  ink: 0x1c1915,
  cream: 0xf6f1e4,
  entry: 0x1d4ed8,
  conflictInk: 0xb91c1c,
  line: 0x2a241c,
  key: 0x172033,
  keyText: 0xf6f1e4,
  keyOn: 0xf0c36a,
  keyOnText: 0x2c1b08,
  keyOff: 0x3a342c,
  note: 0x5c5346,
  muted: 0xc4b8a2,
};

const GAP = 3;
const BOX_GAP = 8;

export class SudokuScene {
  static heightFor(width: number, phase: SudokuPhase): number {
    if (phase === 'pick') return 292;
    if (phase === 'generating') return 96;
    if (phase === 'done') return width + 188;
    return width + 168;
  }

  static fitWidth(maxWidth: number, maxHeight: number, phase: SudokuPhase): number {
    const width = Math.max(180, Math.floor(maxWidth));
    if (maxHeight <= 0 || this.heightFor(width, phase) <= maxHeight) return width;
    let low = 180;
    let high = width;
    for (let step = 0; step < 16; step += 1) {
      const mid = Math.floor((low + high) / 2);
      if (this.heightFor(mid, phase) > maxHeight) high = mid;
      else low = mid;
    }
    return low;
  }

  static async create(canvas: HTMLCanvasElement): Promise<SudokuScene> {
    const app = new Application();
    await app.init({
      canvas,
      width: 320,
      height: 292,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    return new SudokuScene(app);
  }

  private readonly app: Application;
  private readonly root = new Container();
  private readonly gold: FillGradient;
  private state: SudokuSceneState = {
    phase: 'pick',
    values: [],
    notes: [],
    givens: [],
    selected: 0,
    draftMode: false,
    difficultyLabel: '',
    clockText: '',
    submitting: false,
    submitError: '',
    showReplay: false,
  };
  private handlers: SudokuSceneHandlers = {
    onPick: () => undefined,
    onSelect: () => undefined,
    onDigit: () => undefined,
    onToggleDraft: () => undefined,
    onReplay: () => undefined,
  };
  private width = 320;
  private built = '';

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

  setHandlers(handlers: SudokuSceneHandlers) {
    this.handlers = handlers;
  }

  setState(state: SudokuSceneState) {
    this.state = state;
    const key = `${state.phase}:${this.width}:${state.submitting}:${state.submitError}:${state.showReplay}`;
    if (key !== this.built) {
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
    const height = SudokuScene.heightFor(this.width, this.state.phase);
    this.app.renderer.resize(this.width, height);
    if (this.state.phase === 'pick') this.drawPick();
    else if (this.state.phase === 'generating') this.drawMessage('正在出题…');
    else this.drawBoard();
  }

  private refresh() {
    if (this.state.phase !== 'play' && this.state.phase !== 'done') return;
    const header = this.root.getChildByLabel('clock');
    if (header instanceof Text) header.text = `${this.state.difficultyLabel}    ${this.state.clockText}`;
    this.paintBoard();
  }

  private drawPick() {
    const title = new Text({
      text: '选择难度',
      style: { fontFamily: FONT, fontSize: 22, fontWeight: '800', fill: COLOR.cream },
    });
    title.position.set(0, 0);
    this.root.addChild(title);

    DIFFICULTIES.forEach((item, index) => {
      const button = this.button(this.width, 56, item.label, true);
      button.position.set(0, 48 + index * 72);
      button.on('pointertap', () => this.handlers.onPick(item.id));
      this.root.addChild(button);
    });
  }

  private drawMessage(message: string) {
    const text = new Text({
      text: message,
      style: { fontFamily: FONT, fontSize: 16, fill: COLOR.muted },
    });
    this.root.addChild(text);
  }

  private drawBoard() {
    const size = this.width;
    const cell = (size - GAP * 6 - BOX_GAP * 2) / 9;
    const selectedValue = this.state.values[this.state.selected] ?? 0;

    const header = new Text({
      text: `${this.state.difficultyLabel}    ${this.state.clockText}`,
      style: { fontFamily: FONT, fontSize: 16, fontWeight: '700', fill: COLOR.cream },
    });
    header.label = 'clock';
    this.root.addChild(header);

    const board = new Container();
    board.position.set(0, 32);
    board.label = 'board';
    this.root.addChild(board);

    for (let index = 0; index < 81; index += 1) {
      const col = index % 9;
      const row = Math.floor(index / 9);
      const cellView = new Container();
      cellView.position.set(this.axis(col, cell), this.axis(row, cell));
      cellView.eventMode = 'static';
      cellView.cursor = 'pointer';
      const bg = new Graphics();
      const label = new Text({
        text: '',
        style: { fontFamily: FONT, fontSize: Math.max(16, cell * 0.52), fontWeight: '800', fill: COLOR.ink },
      });
      label.anchor.set(0.5);
      label.position.set(cell / 2, cell / 2);
      const marks = new Container();
      marks.label = 'marks';
      const markSize = Math.max(8, cell * 0.22);
      const pad = cell * 0.08;
      const step = (cell - pad * 2) / 3;
      for (let digit = 1; digit <= 9; digit += 1) {
        const mark = new Text({
          text: String(digit),
          style: { fontFamily: FONT, fontSize: markSize, fontWeight: '700', fill: COLOR.note },
        });
        mark.anchor.set(0.5);
        mark.position.set(pad + ((digit - 1) % 3) * step + step / 2, pad + Math.floor((digit - 1) / 3) * step + step / 2);
        marks.addChild(mark);
      }
      cellView.addChild(bg, label, marks);
      cellView.on('pointertap', () => {
        if (this.state.phase === 'play') this.handlers.onSelect(index);
      });
      board.addChild(cellView);
      this.paintCell(bg, label, marks, index, cell, selectedValue);
    }

    if (this.state.phase === 'play') {
      const pad = new Container();
      pad.position.set(0, 32 + size + 16);
      pad.label = 'pad';
      const key = (size - GAP * 5) / 6;
      for (let n = 1; n <= 11; n += 1) {
        const kind = n <= 9 ? 'digit' : n === 10 ? 'erase' : 'draft';
        const value = kind === 'digit' ? n : 0;
        const caption = kind === 'erase' ? '擦除' : kind === 'draft' ? '草稿' : String(value);
        const look = this.keyLook(kind, value, selectedValue);
        const button = this.button(key, 48, caption, look.on, look.disabled);
        const slot = n - 1;
        button.position.set((slot % 6) * (key + GAP), Math.floor(slot / 6) * 56);
        button.on('pointertap', () => {
          if (kind === 'draft') this.handlers.onToggleDraft();
          else this.handlers.onDigit(value);
        });
        pad.addChild(button);
      }
      this.root.addChild(pad);
      return;
    }

    const result = new Container();
    result.position.set(0, 32 + size + 16);
    const done = new Text({
      text: this.state.submitting ? '正在保存…' : `完成 · ${this.state.difficultyLabel} · ${this.state.clockText}`,
      style: { fontFamily: FONT, fontSize: 16, fontWeight: '700', fill: COLOR.cream },
    });
    result.addChild(done);
    if (this.state.submitError) {
      const error = new Text({
        text: this.state.submitError,
        style: { fontFamily: FONT, fontSize: 14, fill: COLOR.conflictInk },
      });
      error.position.set(0, 28);
      result.addChild(error);
    }
    if (this.state.showReplay && !this.state.submitting) {
      const replay = this.button(160, 48, '再来一局', true);
      replay.position.set(0, this.state.submitError ? 56 : 32);
      replay.on('pointertap', () => this.handlers.onReplay());
      result.addChild(replay);
    }
    this.root.addChild(result);
  }

  private paintBoard() {
    const board = this.root.getChildByLabel('board');
    if (!board) {
      this.built = '';
      this.rebuild();
      return;
    }
    const cell = (this.width - GAP * 6 - BOX_GAP * 2) / 9;
    const selectedValue = this.state.values[this.state.selected] ?? 0;
    board.children.forEach((child, index) => {
      const bg = child.children[0] as Graphics;
      const label = child.children[1] as Text;
      const marks = child.children[2] as Container;
      this.paintCell(bg, label, marks, index, cell, selectedValue);
    });
    const pad = this.root.getChildByLabel('pad');
    if (pad) {
      const keyWidth = (this.width - GAP * 5) / 6;
      pad.children.forEach((button, index) => {
        const kind = index < 9 ? 'digit' : index === 9 ? 'erase' : 'draft';
        const value = kind === 'digit' ? index + 1 : 0;
        const look = this.keyLook(kind, value, selectedValue);
        const bg = button.children[0] as Graphics;
        const label = button.children[1] as Text;
        this.paintButton(bg, keyWidth, 48, look.on, look.disabled);
        label.style.fill = look.disabled ? COLOR.muted : look.on ? COLOR.keyOnText : COLOR.keyText;
        button.cursor = look.disabled ? 'default' : 'pointer';
      });
    }
  }

  private keyLook(kind: string, value: number, selectedValue: number) {
    if (kind === 'draft') return { on: this.state.draftMode, disabled: false };
    if (kind === 'erase') return { on: false, disabled: false };
    const complete = isDigitComplete(this.state.values, value);
    const selectedNotes = this.state.notes[this.state.selected] ?? [];
    const on = this.state.draftMode ? selectedNotes.includes(value) : value === selectedValue;
    return { on: on && !complete, disabled: complete };
  }

  private paintCell(bg: Graphics, label: Text, marks: Container, index: number, cell: number, selectedValue: number) {
    const value = this.state.values[index] ?? 0;
    const given = this.state.givens[index] === true;
    const row = Math.floor(index / 9);
    const col = index % 9;
    const selectedRow = Math.floor(this.state.selected / 9);
    const selectedCol = this.state.selected % 9;
    const peer =
      row === selectedRow ||
      col === selectedCol ||
      (Math.floor(row / 3) === Math.floor(selectedRow / 3) && Math.floor(col / 3) === Math.floor(selectedCol / 3));
    const conflict = value !== 0 && hasConflict(this.state.values, index);
    let fill: number = COLOR.paper;
    if (peer) fill = COLOR.paperPeer;
    if (value !== 0 && value === selectedValue) fill = COLOR.paperSame;
    if (index === this.state.selected) fill = COLOR.paperSelected;
    if (conflict) fill = COLOR.paperConflict;
    bg.clear();
    bg.roundRect(0, 0, cell, cell, 6).fill(fill);
    label.text = value ? String(value) : '';
    label.visible = value !== 0;
    label.style.fill = conflict ? COLOR.conflictInk : given ? COLOR.ink : COLOR.entry;
    const cellNotes = value === 0 ? (this.state.notes[index] ?? []) : [];
    const markSet = new Set(cellNotes);
    marks.visible = value === 0 && cellNotes.length > 0;
    marks.children.forEach((child, digitIndex) => {
      child.visible = markSet.has(digitIndex + 1);
    });
  }

  private paintButton(bg: Graphics, width: number, height: number, gold: boolean, disabled = false) {
    bg.clear();
    bg.roundRect(0, 0, width, height, 14).fill(disabled ? COLOR.keyOff : gold ? this.gold : COLOR.key);
  }

  private button(width: number, height: number, caption: string, gold: boolean, disabled = false) {
    const root = new Container();
    const bg = new Graphics();
    this.paintButton(bg, width, height, gold, disabled);
    const label = new Text({
      text: caption,
      style: {
        fontFamily: FONT,
        fontSize: caption.length > 2 ? 16 : 20,
        fontWeight: '800',
        fill: disabled ? COLOR.muted : gold ? COLOR.keyOnText : COLOR.keyText,
      },
    });
    label.anchor.set(0.5);
    label.position.set(width / 2, height / 2);
    root.addChild(bg, label);
    root.eventMode = 'static';
    root.cursor = 'pointer';
    return root;
  }

  private axis(index: number, cell: number) {
    const box = Math.floor(index / 3);
    const inner = index % 3;
    return box * (cell * 3 + GAP * 2 + BOX_GAP) + inner * (cell + GAP);
  }
}
