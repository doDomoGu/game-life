import { Application, Assets, Container, FillGradient, Graphics, Sprite, Text, Texture } from 'pixi.js';
import {
  closedTiles13,
  emptyDraft,
  markRedTiles,
  paymentFields,
  yakuLine,
  type AnswerDraft,
} from '../../display.js';
import { QUESTION_COUNTS, type QuestionCount } from '../../meta.js';
import { expectedText, explanation } from '../../points.js';
import { TILE_FILE_NAMES, tileImageName } from '../../tiles.js';
import type { Question } from '../../types.js';

export type ScorePhase = 'pick' | 'play' | 'result' | 'done';
export type FocusField = 'fu' | 'han' | 'ron' | 'each' | 'child' | 'dealer';

export interface ScoreSceneState {
  phase: ScorePhase;
  question: Question | null;
  index: number;
  total: number;
  correct: number;
  draft: AnswerDraft;
  focus: FocusField;
  lastCorrect: boolean;
  submitting: boolean;
  submitError: string;
  showReplay: boolean;
}

export interface ScoreSceneHandlers {
  onPick: (count: QuestionCount) => void;
  onFocus: (field: FocusField) => void;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  onNext: () => void;
  onReplay: () => void;
}

const FONT = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
const COLOR = {
  cream: 0xf6f1e4,
  ink: 0x2c1b08,
  key: 0x172033,
  keyText: 0xf6f1e4,
  keyOn: 0xf0c36a,
  keyOnText: 0x2c1b08,
  muted: 0xc4b8a2,
  ok: 0x86efac,
  bad: 0xfca5a5,
  paper: 0xf6f0e4,
  field: 0x1c1915,
};

const tileUrlFiles = import.meta.glob('../../../assets/tiles/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const tileUrls: Record<string, string> = {};
for (const [path, url] of Object.entries(tileUrlFiles)) {
  const name = path.split('/').pop()?.replace(/\.svg$/, '');
  if (name) tileUrls[name] = url;
}

export class ScoreScene {
  static heightFor(width: number, phase: ScorePhase, fieldCount = 4): number {
    const tileH = width < 380 ? 38 : 44;
    if (phase === 'pick') return 32 + QUESTION_COUNTS.length * 60;
    if (phase === 'done') return 140;
    if (phase === 'result') return 24 + 20 + tileH * 2 + 16 + 38 + 200;
    const field = width < 380 ? 38 : 42;
    const key = width < 380 ? 36 : 40;
    return 24 + 20 + tileH * 2 + 16 + 18 + fieldCount * (field + 4) + key * 2 + 12 + 44;
  }

  static fitWidth(maxWidth: number, maxHeight: number, phase: ScorePhase, fieldCount = 4): number {
    const width = Math.max(240, Math.min(420, Math.floor(maxWidth)));
    if (maxHeight <= 0 || this.heightFor(width, phase, fieldCount) <= maxHeight) return width;
    let low = 240;
    let high = width;
    for (let step = 0; step < 16; step += 1) {
      const mid = Math.floor((low + high) / 2);
      if (this.heightFor(mid, phase, fieldCount) > maxHeight) high = mid;
      else low = mid;
    }
    return low;
  }

  static async create(canvas: HTMLCanvasElement): Promise<ScoreScene> {
    const app = new Application();
    await app.init({
      canvas,
      width: 320,
      height: 260,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    await Assets.load(
      TILE_FILE_NAMES
        .map((name) => tileUrls[name] && { alias: `mj-${name}`, src: tileUrls[name] })
        .filter((asset): asset is { alias: string; src: string } => Boolean(asset)),
    );
    return new ScoreScene(app);
  }

  private readonly app: Application;
  private readonly root = new Container();
  private readonly gold: FillGradient;
  private state: ScoreSceneState = {
    phase: 'pick',
    question: null,
    index: 0,
    total: 0,
    correct: 0,
    draft: emptyDraft(),
    focus: 'fu',
    lastCorrect: false,
    submitting: false,
    submitError: '',
    showReplay: false,
  };
  private handlers: ScoreSceneHandlers = {
    onPick: () => undefined,
    onFocus: () => undefined,
    onDigit: () => undefined,
    onBackspace: () => undefined,
    onSubmit: () => undefined,
    onNext: () => undefined,
    onReplay: () => undefined,
  };
  private width = 320;
  private built = '';
  layoutSize = { width: 320, height: 260 };

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

  setHandlers(handlers: ScoreSceneHandlers) {
    this.handlers = handlers;
  }

  setState(state: ScoreSceneState) {
    this.state = state;
    const key = [
      state.phase,
      this.width,
      state.index,
      state.total,
      state.focus,
      state.draft.fu,
      state.draft.han,
      state.draft.ron,
      state.draft.each,
      state.draft.child,
      state.draft.dealer,
      state.lastCorrect,
      state.submitting,
      state.submitError,
      state.showReplay,
      state.question?.winTile ?? '',
    ].join(':');
    if (key === this.built) return;
    this.built = key;
    this.rebuild();
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
    if (this.state.phase === 'pick') this.drawPick();
    else if (this.state.phase === 'done') this.drawDone();
    else this.drawPlay();
    const bounds = this.root.getLocalBounds();
    const height = Math.max(1, Math.ceil(bounds.y + bounds.height + 8));
    this.layoutSize = { width: this.width, height };
    this.app.renderer.resize(this.width, height);
  }

  private drawPick() {
    const title = new Text({
      text: '选择题量',
      style: { fontFamily: FONT, fontSize: 18, fontWeight: '800', fill: COLOR.cream },
    });
    this.root.addChild(title);
    QUESTION_COUNTS.forEach((count, index) => {
      const button = this.button(this.width, 48, `${count} 题`, true);
      button.position.set(0, 36 + index * 58);
      button.on('pointertap', () => this.handlers.onPick(count));
      this.root.addChild(button);
    });
  }

  private drawDone() {
    const title = new Text({
      text: this.state.submitting
        ? '正在保存…'
        : `答对 ${this.state.correct} / ${this.state.total} 题`,
      style: { fontFamily: FONT, fontSize: 20, fontWeight: '800', fill: COLOR.cream },
    });
    this.root.addChild(title);
    if (this.state.submitError) {
      const error = new Text({
        text: this.state.submitError,
        style: { fontFamily: FONT, fontSize: 14, fill: COLOR.bad },
      });
      error.position.set(0, 36);
      this.root.addChild(error);
    }
    if (this.state.showReplay && !this.state.submitting) {
      const replay = this.button(160, 48, '再来一局', true);
      replay.position.set(0, this.state.submitError ? 64 : 48);
      replay.on('pointertap', () => this.handlers.onReplay());
      this.root.addChild(replay);
    }
  }

  private drawPlay() {
    const question = this.state.question;
    if (!question) return;
    const tight = this.width < 380;
    const tileH = tight ? 38 : 44;
    const tileW = tight ? 28 : 32;
    const fieldH = tight ? 38 : 42;
    const keyH = tight ? 36 : 40;
    let y = 0;

    const header = new Text({
      text: `第 ${this.state.index + 1} / ${this.state.total} 题    已对 ${this.state.correct}`,
      style: { fontFamily: FONT, fontSize: 14, fontWeight: '700', fill: COLOR.cream },
    });
    header.position.set(0, y);
    this.root.addChild(header);
    y += 22;

    const status = new Text({
      text: [
        question.dealer ? '庄家' : '子家',
        question.winType === 'ron' ? '荣和' : '自摸',
        question.riichi ? '立直' : '未立直',
        question.ippatsu ? '一发' : '',
        `本场 ${question.honba}`,
        question.waitType,
      ]
        .filter(Boolean)
        .join(' · '),
      style: { fontFamily: FONT, fontSize: 12, fill: COLOR.muted, wordWrap: true, wordWrapWidth: this.width },
    });
    status.position.set(0, y);
    this.root.addChild(status);
    y += 20;

    const hand = closedTiles13(question);
    const reds = markRedTiles([...hand, question.winTile, ...question.doraIndicators, ...question.uraDoraIndicators], question.redDoraCount);
    let redIndex = 0;
    const handReds = hand.map(() => reds[redIndex++] === true);
    const winRed = reds[redIndex++] === true;
    const doraReds = question.doraIndicators.map(() => reds[redIndex++] === true);
    const uraReds = question.uraDoraIndicators.map(() => reds[redIndex++] === true);

    this.root.addChild(this.tileRow(hand, handReds, tileW, tileH, 0, y));
    const handRows = 1 + Math.floor((Math.max(hand.length, 1) - 1) / Math.max(1, Math.floor(this.width / (tileW + 2))));
    y += tileH * handRows + 8;

    const winLabel = new Text({
      text: '和了牌',
      style: { fontFamily: FONT, fontSize: 12, fill: COLOR.muted },
    });
    winLabel.position.set(0, y);
    this.root.addChild(winLabel);
    this.root.addChild(this.tileRow([question.winTile], [winRed], tileW, tileH, 48, y - 4));

    const doraX = 48 + tileW + 16;
    const doraLabel = new Text({
      text: '宝牌指示',
      style: { fontFamily: FONT, fontSize: 12, fill: COLOR.muted },
    });
    doraLabel.position.set(doraX, y);
    this.root.addChild(doraLabel);
    this.root.addChild(this.tileRow(question.doraIndicators, doraReds, tileW, tileH, doraX + 56, y - 4));
    if (question.uraDoraIndicators.length) {
      const uraX = doraX + 56 + question.doraIndicators.length * (tileW + 2) + 8;
      const uraLabel = new Text({
        text: '里宝',
        style: { fontFamily: FONT, fontSize: 12, fill: COLOR.muted },
      });
      uraLabel.position.set(uraX, y);
      this.root.addChild(uraLabel);
      this.root.addChild(this.tileRow(question.uraDoraIndicators, uraReds, tileW, tileH, uraX + 32, y - 4));
    }
    y += tileH + 4;

    const yaku = new Text({
      text: yakuLine(question),
      style: { fontFamily: FONT, fontSize: 12, fill: COLOR.muted, wordWrap: true, wordWrapWidth: this.width },
    });
    yaku.position.set(0, y);
    this.root.addChild(yaku);
    y += 18;

    if (this.state.phase === 'result') {
      const ok = this.state.lastCorrect;
      const result = new Text({
        text: ok ? '答对' : '答错',
        style: { fontFamily: FONT, fontSize: 18, fontWeight: '800', fill: ok ? COLOR.ok : COLOR.bad },
      });
      result.position.set(0, y);
      this.root.addChild(result);
      y += 26;
      const expected = new Text({
        text: expectedText(question),
        style: { fontFamily: FONT, fontSize: 13, fill: COLOR.cream, wordWrap: true, wordWrapWidth: this.width },
      });
      expected.position.set(0, y);
      this.root.addChild(expected);
      y += 40;
      const why = new Text({
        text: explanation(question),
        style: { fontFamily: FONT, fontSize: 12, fill: COLOR.muted, wordWrap: true, wordWrapWidth: this.width },
      });
      why.position.set(0, y);
      this.root.addChild(why);
      y += 56;
      const next = this.button(this.width, 44, this.state.index + 1 >= this.state.total ? '查看成绩' : '下一题', true);
      next.position.set(0, y);
      next.on('pointertap', () => this.handlers.onNext());
      this.root.addChild(next);
      return;
    }

    const fields: Array<{ id: FocusField; label: string; value: string }> = [
      { id: 'fu', label: '符数', value: this.state.draft.fu },
      { id: 'han', label: '番数', value: this.state.draft.han },
      ...paymentFields(question).map((field) => ({
        id: field.id,
        label: field.label,
        value: this.state.draft[field.id],
      })),
    ];
    fields.forEach((field, index) => {
      const row = this.fieldRow(field.label, field.value || '—', field.id === this.state.focus, fieldH);
      row.position.set(0, y + index * (fieldH + 4));
      row.on('pointertap', () => this.handlers.onFocus(field.id));
      this.root.addChild(row);
    });
    y += fields.length * (fieldH + 4) + 6;

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫'];
    const gap = 4;
    const keyW = (this.width - gap * 5) / 6;
    keys.forEach((key, index) => {
      const button = this.button(keyW, keyH, key, false);
      button.position.set((index % 6) * (keyW + gap), y + Math.floor(index / 6) * (keyH + 4));
      button.on('pointertap', () => {
        if (key === '⌫') this.handlers.onBackspace();
        else this.handlers.onDigit(key);
      });
      this.root.addChild(button);
    });
    y += (keyH + 4) * 2 + 6;
    const submit = this.button(this.width, 44, '提交答案', true);
    submit.position.set(0, y);
    submit.on('pointertap', () => this.handlers.onSubmit());
    this.root.addChild(submit);
  }

  private tileRow(tiles: string[], reds: boolean[], tileW: number, tileH: number, x: number, y: number) {
    const row = new Container();
    row.position.set(x, y);
    const perRow = Math.max(1, Math.floor((this.width - x) / (tileW + 2)));
    tiles.forEach((tile, index) => {
      const sprite = new Sprite(this.textureOf(tile, reds[index] === true));
      sprite.width = tileW;
      sprite.height = tileH;
      sprite.roundPixels = true;
      sprite.x = (index % perRow) * (tileW + 2);
      sprite.y = Math.floor(index / perRow) * (tileH + 4);
      row.addChild(sprite);
    });
    return row;
  }

  private textureOf(tile: string, red: boolean): Texture {
    const name = tileImageName(tile, red);
    const loaded = Assets.get<Texture>(`mj-${name}`);
    return loaded instanceof Texture ? loaded : Texture.EMPTY;
  }

  private fieldRow(label: string, value: string, focus: boolean, height = 42) {
    const root = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, this.width, height, 12).fill(focus ? this.gold : COLOR.paper);
    const caption = new Text({
      text: label,
      style: { fontFamily: FONT, fontSize: 13, fill: COLOR.ink },
    });
    caption.position.set(12, Math.round((height - 16) / 2));
    const amount = new Text({
      text: value,
      style: { fontFamily: FONT, fontSize: 16, fontWeight: '800', fill: COLOR.field },
    });
    amount.anchor.set(1, 0.5);
    amount.position.set(this.width - 14, height / 2);
    root.addChild(bg, caption, amount);
    root.eventMode = 'static';
    root.cursor = 'pointer';
    return root;
  }

  private paintButton(bg: Graphics, width: number, height: number, gold: boolean) {
    bg.clear();
    bg.roundRect(0, 0, width, height, 14).fill(gold ? this.gold : COLOR.key);
  }

  private button(width: number, height: number, caption: string, gold: boolean) {
    const root = new Container();
    const bg = new Graphics();
    this.paintButton(bg, width, height, gold);
    const label = new Text({
      text: caption,
      style: {
        fontFamily: FONT,
        fontSize: caption.length > 3 ? 15 : 18,
        fontWeight: '800',
        fill: gold ? COLOR.keyOnText : COLOR.keyText,
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
