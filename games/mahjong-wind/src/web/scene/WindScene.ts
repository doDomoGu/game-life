import { Application, Container, FillGradient, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import {
  WIND_LABEL,
  WIND_ORDER,
  formatDelta,
  formatPt,
  formatRound,
  windOf,
  type MahjongWindView,
  type Wind,
} from '../../view.js';

export type WindModal =
  | { type: 'confirm'; title: string; message: string; okLabel: string }
  | { type: 'wizard'; step: 'kind' | 'flag'; kind: 'win' | 'draw'; dealerLocked: boolean }
  | { type: 'pad'; raw: string; negative: boolean };

export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '000' | 'del' | 'sign' | 'clear';

export type WindIntent =
  | 'toggle-score'
  | 'riichi'
  | 'settle'
  | 'undo-hand'
  | 'back-hand'
  | 'no-change'
  | 'fill'
  | 'cancel-settle'
  | 'next-hand'
  | 'end-match'
  | 'exit'
  | 'confirm-ok'
  | 'modal-close'
  | 'wizard-win'
  | 'wizard-draw'
  | 'wizard-yes'
  | 'wizard-no'
  | 'wizard-back'
  | 'pad-ok'
  | 'pad-zero'
  | `pad:${PadKey}`;

export interface WindSceneState {
  view: MahjongWindView | null;
  myId: string;
  scoreMode: 'absolute' | 'diff';
  modal: WindModal | null;
  notice: string;
  noticeIsError: boolean;
  connecting: boolean;
}

type Side = 'bottom' | 'right' | 'top' | 'left';

const FONT = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
const RELATION: Record<Side, string> = { bottom: '自己', right: '下家', top: '对家', left: '上家' };

const COLOR = {
  felt: 0x0f4d3a,
  feltEdge: 0x0a3328,
  card: 0x13263d,
  cardMine: 0x1b3554,
  cream: 0xf6f1e4,
  muted: 0x9fb3c8,
  gold: 0xf0c36a,
  ink: 0x2c1b08,
  dealer: 0xe0533d,
  up: 0x4ade80,
  down: 0xf87171,
  key: 0x172033,
  panel: 0x101c2e,
};

const BAR_GAP = 12;
const BUTTON_H = 48;
const NOTICE_H = 40;
const PAD_H = 404;

export class WindScene {
  static heightFor(width: number, modal: WindModal | null): number {
    const base = width + NOTICE_H + BUTTON_H + BAR_GAP;
    return modal?.type === 'pad' ? Math.max(base, PAD_H + 16) : base;
  }

  static fitWidth(maxWidth: number, maxHeight: number, modal: WindModal | null): number {
    const width = Math.max(240, Math.floor(maxWidth));
    if (maxHeight <= 0 || this.heightFor(width, modal) <= maxHeight) return width;
    let low = 240;
    let high = width;
    for (let step = 0; step < 16; step += 1) {
      const mid = Math.floor((low + high) / 2);
      if (this.heightFor(mid, modal) > maxHeight) high = mid;
      else low = mid;
    }
    return low;
  }

  static async create(canvas: HTMLCanvasElement): Promise<WindScene> {
    const app = new Application();
    await app.init({
      canvas,
      width: 320,
      height: 420,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    return new WindScene(app);
  }

  private readonly app: Application;
  private readonly root = new Container();
  private readonly gold: FillGradient;
  private state: WindSceneState = {
    view: null,
    myId: '',
    scoreMode: 'absolute',
    modal: null,
    notice: '',
    noticeIsError: false,
    connecting: false,
  };
  private onIntent: (intent: WindIntent) => void = () => undefined;
  private width = 320;

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

  setIntentHandler(handler: (intent: WindIntent) => void) {
    this.onIntent = handler;
  }

  setState(state: WindSceneState) {
    this.state = state;
    this.rebuild();
  }

  resize(width: number) {
    const next = Math.max(240, Math.floor(width));
    if (next === this.width) return;
    this.width = next;
    this.rebuild();
  }

  destroy() {
    this.clearRoot();
    this.app.destroy({ removeView: false }, { children: true });
  }

  private clearRoot() {
    for (const child of this.root.removeChildren()) child.destroy({ children: true });
  }

  private get height() {
    return WindScene.heightFor(this.width, this.state.modal);
  }

  private rebuild() {
    this.clearRoot();
    this.app.renderer.resize(this.width, this.height);
    const view = this.state.view;
    if (!view) return;
    if (view.game.phase === 'finished') this.drawResults(view);
    else this.drawTable(view);
    this.drawNotice(view);
    this.drawActions(view);
    if (this.state.modal) this.drawModal(this.state.modal);
  }

  private layoutWinds(view: MahjongWindView): Record<Side, Wind> {
    const mine = windOf(view.game.seats, this.state.myId) ?? 'E';
    const index = WIND_ORDER.indexOf(mine);
    const at = (offset: number) => WIND_ORDER[(index + offset) % 4]!;
    return { bottom: at(0), right: at(1), top: at(2), left: at(3) };
  }

  private nameOf(view: MahjongWindView, userId: string) {
    return view.players.find((p) => p.userId === userId)?.username ?? '玩家';
  }

  private drawTable(view: MahjongWindView) {
    const W = this.width;
    const table = new Graphics();
    table.roundRect(0, 0, W, W, 26).fill(COLOR.feltEdge);
    table.roundRect(6, 6, W - 12, W - 12, 22).fill(COLOR.felt);
    this.root.addChild(table);

    const winds = this.layoutWinds(view);
    const wideW = Math.round(W * 0.42);
    const wideH = Math.round(W * 0.23);
    const sideW = Math.round(W * 0.27);
    const sideH = Math.round(W * 0.34);
    const pad = 14;
    const places: Record<Side, { x: number; y: number; w: number; h: number }> = {
      top: { x: (W - wideW) / 2, y: pad, w: wideW, h: wideH },
      bottom: { x: (W - wideW) / 2, y: W - wideH - pad, w: wideW, h: wideH },
      left: { x: pad, y: (W - sideH) / 2, w: sideW, h: sideH },
      right: { x: W - sideW - pad, y: (W - sideH) / 2, w: sideW, h: sideH },
    };
    for (const side of ['top', 'left', 'right', 'bottom'] as Side[]) {
      const place = places[side];
      const card = this.seatCard(view, side, winds[side], place.w, place.h);
      card.position.set(place.x, place.y);
      this.root.addChild(card);
    }
    this.root.addChild(this.disk(view));

    if (this.state.connecting) {
      const tip = this.label('重连中…', { fontSize: 12, fill: COLOR.gold, fontWeight: '700' });
      tip.anchor.set(1, 0);
      tip.position.set(W - 14, 10);
      this.root.addChild(tip);
    }
  }

  private seatCard(view: MahjongWindView, side: Side, wind: Wind, w: number, h: number) {
    const game = view.game;
    const playerId = game.seats[wind];
    const mine = playerId === this.state.myId;
    const dealer = game.dealerWind === wind;
    const reached = Boolean(game.riichi[playerId]);
    const connected = view.players.find((p) => p.userId === playerId)?.connected ?? true;
    const score = game.scores[playerId] ?? 0;
    const myScore = game.scores[this.state.myId] ?? 0;
    const diff = this.state.scoreMode === 'diff' && !mine;

    const root = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, w, h, 16).fill(mine ? COLOR.cardMine : COLOR.card);
    bg.roundRect(0, 0, w, h, 16).stroke({ width: mine ? 2 : 1, color: mine ? COLOR.gold : 0x2b4466 });
    root.addChild(bg);

    const vertical = side === 'left' || side === 'right';
    const windBadge = new Graphics();
    windBadge.circle(0, 0, 13).fill(dealer ? COLOR.dealer : 0x2b4466);
    const windText = this.label(WIND_LABEL[wind], { fontSize: 15, fontWeight: '800', fill: COLOR.cream });
    windText.anchor.set(0.5);
    const badge = new Container();
    badge.addChild(windBadge, windText);
    badge.position.set(21, 21);
    root.addChild(badge);

    const tag = this.label(`${dealer ? '亲 · ' : ''}${RELATION[side]}`, {
      fontSize: 11,
      fill: dealer ? 0xffb4a6 : COLOR.muted,
      fontWeight: '600',
    });
    tag.position.set(40, 14);
    root.addChild(tag);

    const nameY = vertical ? 42 : 38;
    const name = this.label(this.nameOf(view, playerId), { fontSize: 13, fill: COLOR.cream, fontWeight: '700' });
    this.clip(name, w - 20);
    name.position.set(10, nameY);
    root.addChild(name);

    const scoreText = diff ? formatDelta(score - myScore) : String(score);
    const scoreFill = diff ? (score > myScore ? COLOR.up : score < myScore ? COLOR.down : COLOR.cream) : COLOR.cream;
    const scoreLabel = this.label(scoreText, {
      fontSize: vertical ? 18 : 20,
      fill: scoreFill,
      fontWeight: '800',
    });
    this.clip(scoreLabel, w - 20);
    scoreLabel.position.set(10, nameY + 18);
    root.addChild(scoreLabel);

    if (reached) {
      const stick = new Graphics();
      const stickW = Math.min(w - 20, 64);
      const stickY = h - 12;
      stick.roundRect(10, stickY - 4, stickW, 8, 4).fill(0xf8fafc);
      stick.circle(10 + stickW / 2, stickY, 2.6).fill(COLOR.dealer);
      root.addChild(stick);
    }

    const input = game.settle?.inputs[playerId];
    if ((game.phase === 'settling' || game.phase === 'handEnd') && input) {
      const text = input.confirmed ? formatDelta(input.value) : '未交';
      const chip = this.chip(text, input.confirmed ? 0x14532d : 0x334155, input.confirmed ? 0xbbf7d0 : COLOR.muted);
      chip.position.set(w - chip.width - 8, vertical ? h - chip.height - 22 : 8);
      root.addChild(chip);
    } else if (!connected) {
      const chip = this.chip('离线', 0x7f1d1d, 0xfecaca);
      chip.position.set(w - chip.width - 8, 8);
      root.addChild(chip);
    }
    return root;
  }

  private disk(view: MahjongWindView) {
    const W = this.width;
    const game = view.game;
    const radius = W * 0.17;
    const root = new Container();
    root.position.set(W / 2, W / 2);
    const ring = new Graphics();
    ring.circle(0, 0, radius + 5).fill(0x0a3328);
    ring.circle(0, 0, radius).fill(0x13263d);
    ring.circle(0, 0, radius).stroke({ width: 2, color: COLOR.gold, alpha: 0.7 });
    root.addChild(ring);

    const round = this.label(formatRound(game.roundWind, game.kyoku), {
      fontSize: Math.round(radius * 0.36),
      fill: COLOR.gold,
      fontWeight: '800',
    });
    round.anchor.set(0.5);
    round.position.set(0, -radius * 0.32);
    const sticks = this.label(`本场 ${game.honba} · 供托 ${game.kyotaku}`, {
      fontSize: Math.max(10, Math.round(radius * 0.17)),
      fill: COLOR.cream,
      fontWeight: '600',
    });
    sticks.anchor.set(0.5);
    sticks.position.set(0, radius * 0.12);
    const mode = this.label(this.state.scoreMode === 'diff' ? '看分差 · 点我切换' : '看点数 · 点我切换', {
      fontSize: Math.max(9, Math.round(radius * 0.14)),
      fill: COLOR.muted,
    });
    mode.anchor.set(0.5);
    mode.position.set(0, radius * 0.48);
    root.addChild(round, sticks, mode);

    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.on('pointertap', () => this.onIntent('toggle-score'));
    return root;
  }

  private drawResults(view: MahjongWindView) {
    const W = this.width;
    const panel = new Graphics();
    panel.roundRect(0, 0, W, W, 26).fill(COLOR.feltEdge);
    panel.roundRect(6, 6, W - 12, W - 12, 22).fill(COLOR.felt);
    this.root.addChild(panel);

    const title = this.label('对局结束', { fontSize: 22, fill: COLOR.gold, fontWeight: '800' });
    title.anchor.set(0.5, 0);
    title.position.set(W / 2, 22);
    this.root.addChild(title);

    const rows = view.game.results ?? [];
    const top = 66;
    const rowH = Math.min(64, (W - top - 20) / Math.max(1, rows.length));
    rows.forEach((row, index) => {
      const y = top + index * rowH;
      const mine = row.id === this.state.myId;
      const bg = new Graphics();
      bg.roundRect(16, y, W - 32, rowH - 8, 14).fill(mine ? COLOR.cardMine : COLOR.card);
      if (mine) bg.roundRect(16, y, W - 32, rowH - 8, 14).stroke({ width: 2, color: COLOR.gold });
      this.root.addChild(bg);

      const mid = y + (rowH - 8) / 2;
      const medal = new Graphics();
      medal.circle(42, mid, 14).fill(row.rank === 1 ? COLOR.gold : 0x2b4466);
      const rank = this.label(String(row.rank), {
        fontSize: 15,
        fill: row.rank === 1 ? COLOR.ink : COLOR.cream,
        fontWeight: '800',
      });
      rank.anchor.set(0.5);
      rank.position.set(42, mid);
      this.root.addChild(medal, rank);

      const wind = windOf(view.game.seats, row.id);
      const name = this.label(`${wind ? `${WIND_LABEL[wind]} · ` : ''}${this.nameOf(view, row.id)}`, {
        fontSize: 14,
        fill: COLOR.cream,
        fontWeight: '700',
      });
      this.clip(name, W * 0.4);
      name.anchor.set(0, 1);
      name.position.set(66, mid + 1);
      const score = this.label(`${row.score} 点`, { fontSize: 12, fill: COLOR.muted });
      score.position.set(66, mid + 3);
      const pt = this.label(`${formatPt(row.pt)} pt`, {
        fontSize: 18,
        fill: row.pt >= 0 ? COLOR.up : COLOR.down,
        fontWeight: '800',
      });
      pt.anchor.set(1, 0.5);
      pt.position.set(W - 30, mid);
      this.root.addChild(name, score, pt);
    });
  }

  private drawNotice(view: MahjongWindView) {
    const W = this.width;
    const text = this.state.notice || this.defaultNotice(view);
    if (!text) return;
    const notice = this.label(text, {
      fontSize: 13,
      fill: this.state.noticeIsError ? COLOR.down : COLOR.muted,
      fontWeight: this.state.noticeIsError ? '700' : '500',
      wordWrap: true,
      wordWrapWidth: W - 8,
      breakWords: true,
      align: 'center',
      lineHeight: 17,
    });
    notice.anchor.set(0.5, 0.5);
    notice.position.set(W / 2, W + NOTICE_H / 2 + 2);
    this.root.addChild(notice);
  }

  private defaultNotice(view: MahjongWindView) {
    const game = view.game;
    if (game.phase === 'finished') return '对局已结束，记录已保存。点「回到房间」重新开始新的对局';
    if (game.phase === 'handEnd' && game.next) {
      if (game.next.over) return '南 4 局已打完，点「结束对局」看最终结算';
      const renchan = game.next.dealerWind === game.dealerWind;
      const label = `${formatRound(game.next.roundWind, game.next.kyoku)}${game.next.honba ? ` ${game.next.honba} 本场` : ''}`;
      return `本局已入分。下一局：${label}${renchan ? '（连庄）' : ''}`;
    }
    if (game.phase === 'settling' && game.settle) {
      if (game.settle.error) return game.settle.error;
      const head =
        game.settle.kind === 'win'
          ? game.settle.dealerFlag
            ? '亲家和牌'
            : '子家和牌'
          : game.settle.dealerFlag
            ? '流局 · 亲家听牌'
            : '流局 · 亲家不听';
      const waiting = Object.values(game.settle.inputs).filter((input) => !input.confirmed).length;
      return `${head} · 还有 ${waiting} 家未交`;
    }
    return '点立直扣 1000；一局打完点「发起结算」';
  }

  private drawActions(view: MahjongWindView) {
    const W = this.width;
    const y = W + NOTICE_H + BAR_GAP;
    const game = view.game;
    const buttons: Array<{ caption: string; intent: WindIntent; style: ButtonStyle; enabled?: boolean }> = [];

    if (game.phase === 'finished') {
      buttons.push({ caption: '回到房间', intent: 'exit', style: 'gold' });
    } else if (game.phase === 'handEnd') {
      buttons.push({ caption: '撤销本局', intent: 'undo-hand', style: 'ghost' });
      buttons.push({ caption: '结束对局', intent: 'end-match', style: game.next?.over ? 'gold' : 'dark' });
      if (!game.next?.over) buttons.push({ caption: '开始下一局', intent: 'next-hand', style: 'gold' });
    } else if (game.phase === 'settling') {
      const mine = game.settle?.inputs[this.state.myId];
      buttons.push({ caption: '无变化', intent: 'no-change', style: 'dark' });
      buttons.push({ caption: mine?.confirmed ? '改分' : '填分', intent: 'fill', style: 'gold' });
      buttons.push({ caption: '取消结算', intent: 'cancel-settle', style: 'ghost' });
      buttons.push({ caption: '撤销本局', intent: 'undo-hand', style: 'ghost' });
    } else {
      const reached = Boolean(game.riichi[this.state.myId]);
      buttons.push({ caption: reached ? '取消立直' : '立直', intent: 'riichi', style: reached ? 'ghost' : 'dark' });
      buttons.push({ caption: '发起结算', intent: 'settle', style: 'gold' });
      if (game.canGoBack) buttons.push({ caption: '回到上一局', intent: 'back-hand', style: 'ghost' });
    }

    const gap = 8;
    const bw = (W - gap * (buttons.length - 1)) / buttons.length;
    buttons.forEach((item, index) => {
      const button = this.button(bw, BUTTON_H, item.caption, item.style, item.enabled !== false);
      button.position.set(index * (bw + gap), y);
      if (item.enabled !== false) button.on('pointertap', () => this.onIntent(item.intent));
      this.root.addChild(button);
    });
  }

  private drawModal(modal: WindModal) {
    const W = this.width;
    const H = this.height;
    const backdrop = new Graphics();
    backdrop.rect(0, 0, W, H).fill({ color: 0x020617, alpha: 0.72 });
    backdrop.eventMode = 'static';
    backdrop.on('pointertap', () => this.onIntent('modal-close'));
    this.root.addChild(backdrop);

    const panel = new Container();
    const content = modal.type === 'pad' ? this.padPanel(modal) : modal.type === 'wizard' ? this.wizardPanel(modal) : this.confirmPanel(modal);
    const ph = content.height;
    const bg = new Graphics();
    bg.roundRect(0, 0, W, ph, 20).fill(COLOR.panel);
    bg.roundRect(0, 0, W, ph, 20).stroke({ width: 1, color: 0x2b4466 });
    bg.eventMode = 'static';
    panel.addChild(bg, content.node);
    panel.position.set(0, Math.max(8, (H - ph) / 2));
    this.root.addChild(panel);
  }

  private confirmPanel(modal: Extract<WindModal, { type: 'confirm' }>) {
    const W = this.width;
    const node = new Container();
    const title = this.label(modal.title, { fontSize: 18, fill: COLOR.cream, fontWeight: '800' });
    title.position.set(18, 18);
    const message = this.label(modal.message, {
      fontSize: 14,
      fill: COLOR.muted,
      wordWrap: true,
      wordWrapWidth: W - 36,
      breakWords: true,
      lineHeight: 20,
    });
    message.position.set(18, 50);
    const y = 50 + message.height + 18;
    const bw = (W - 36 - 10) / 2;
    const cancel = this.button(bw, 46, '取消', 'dark', true);
    cancel.position.set(18, y);
    cancel.on('pointertap', () => this.onIntent('modal-close'));
    const ok = this.button(bw, 46, modal.okLabel, 'gold', true);
    ok.position.set(18 + bw + 10, y);
    ok.on('pointertap', () => this.onIntent('confirm-ok'));
    node.addChild(title, message, cancel, ok);
    return { node, height: y + 46 + 18 };
  }

  private wizardPanel(modal: Extract<WindModal, { type: 'wizard' }>) {
    const W = this.width;
    const node = new Container();
    const kindStep = modal.step === 'kind';
    const titleText = kindStep ? '本局如何结束？' : modal.kind === 'win' ? '和牌的是亲家吗？' : '亲家听牌了吗？';
    const title = this.label(titleText, { fontSize: 18, fill: COLOR.cream, fontWeight: '800' });
    title.position.set(18, 18);
    node.addChild(title);
    let y = 54;
    if (!kindStep && modal.kind === 'draw' && modal.dealerLocked) {
      const sub = this.label('亲家本局已立直，锁定听牌', { fontSize: 13, fill: COLOR.gold });
      sub.position.set(18, y);
      node.addChild(sub);
      y += 26;
    }
    const options: Array<{ caption: string; intent: WindIntent; style: ButtonStyle; enabled?: boolean }> = kindStep
      ? [
          { caption: '有人和牌', intent: 'wizard-win', style: 'gold' },
          { caption: '流局', intent: 'wizard-draw', style: 'dark' },
          { caption: '取消', intent: 'modal-close', style: 'ghost' },
        ]
      : [
          { caption: modal.kind === 'win' ? '亲家和了' : '亲家听牌', intent: 'wizard-yes', style: 'gold' },
          {
            caption: modal.kind === 'win' ? '子家和了' : '亲家不听',
            intent: 'wizard-no',
            style: 'dark',
            enabled: !(modal.kind === 'draw' && modal.dealerLocked),
          },
          { caption: '返回', intent: 'wizard-back', style: 'ghost' },
        ];
    for (const option of options) {
      const enabled = option.enabled !== false;
      const button = this.button(W - 36, 46, option.caption, option.style, enabled);
      button.position.set(18, y);
      if (enabled) button.on('pointertap', () => this.onIntent(option.intent));
      node.addChild(button);
      y += 56;
    }
    return { node, height: y + 8 };
  }

  private padPanel(modal: Extract<WindModal, { type: 'pad' }>) {
    const W = this.width;
    const node = new Container();
    const inset = 14;
    const title = this.label('本局点数变化', { fontSize: 17, fill: COLOR.cream, fontWeight: '800' });
    title.position.set(inset, 14);
    const note = this.label('不含局中已扣的立直 1000；和牌的人要算上供托', { fontSize: 11, fill: COLOR.muted });
    this.clip(note, W - inset * 2);
    note.position.set(inset, 40);

    const amount = Number(modal.raw || 0) * (modal.negative ? -1 : 1);
    const display = new Graphics();
    display.roundRect(inset, 62, W - inset * 2, 50, 12).fill(0x0b1424);
    const value = this.label(formatDelta(amount), {
      fontSize: 26,
      fill: amount > 0 ? COLOR.up : amount < 0 ? COLOR.down : COLOR.cream,
      fontWeight: '800',
    });
    value.anchor.set(1, 0.5);
    value.position.set(W - inset - 14, 87);
    node.addChild(title, note, display, value);

    const keys: Array<{ key: PadKey; caption: string }> = [
      { key: '7', caption: '7' },
      { key: '8', caption: '8' },
      { key: '9', caption: '9' },
      { key: 'del', caption: '删除' },
      { key: '4', caption: '4' },
      { key: '5', caption: '5' },
      { key: '6', caption: '6' },
      { key: 'clear', caption: '清空' },
      { key: '1', caption: '1' },
      { key: '2', caption: '2' },
      { key: '3', caption: '3' },
      { key: 'sign', caption: modal.negative ? '改为 +' : '改为 −' },
      { key: '0', caption: '0' },
      { key: '00', caption: '00' },
      { key: '000', caption: '000' },
    ];
    const gap = 8;
    const kw = (W - inset * 2 - gap * 3) / 4;
    const kh = 46;
    keys.forEach((item, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const style: ButtonStyle = item.key === 'sign' ? (modal.negative ? 'up' : 'down') : col === 3 ? 'ghost' : 'dark';
      const button = this.button(kw, kh, item.caption, style, true, item.caption.length > 2 ? 15 : 20);
      button.position.set(inset + col * (kw + gap), 122 + row * (kh + gap));
      button.on('pointertap', () => this.onIntent(`pad:${item.key}`));
      node.addChild(button);
    });

    const y = 122 + 4 * (kh + gap) + 4;
    const bw = (W - inset * 2 - gap * 2) / 3;
    const actions: Array<{ caption: string; intent: WindIntent; style: ButtonStyle }> = [
      { caption: '取消', intent: 'modal-close', style: 'ghost' },
      { caption: '无变化', intent: 'pad-zero', style: 'dark' },
      { caption: '确认提交', intent: 'pad-ok', style: 'gold' },
    ];
    actions.forEach((item, index) => {
      const button = this.button(bw, 46, item.caption, item.style, true, 16);
      button.position.set(inset + index * (bw + gap), y);
      button.on('pointertap', () => this.onIntent(item.intent));
      node.addChild(button);
    });
    return { node, height: y + 46 + inset };
  }

  private label(text: string, style: TextStyleOptions) {
    return new Text({ text, style: { fontFamily: FONT, ...style } });
  }

  /** 名字太长时截断加省略号 */
  private clip(text: Text, maxWidth: number) {
    if (text.width <= maxWidth) return;
    const full = text.text;
    let length = full.length;
    while (length > 1 && text.width > maxWidth) {
      length -= 1;
      text.text = `${full.slice(0, length)}…`;
    }
  }

  private chip(caption: string, fill: number, color: number) {
    const root = new Container();
    const text = this.label(caption, { fontSize: 11, fill: color, fontWeight: '700' });
    text.position.set(7, 3);
    const bg = new Graphics();
    bg.roundRect(0, 0, text.width + 14, text.height + 6, 9).fill(fill);
    root.addChild(bg, text);
    return root;
  }

  private button(width: number, height: number, caption: string, style: ButtonStyle, enabled: boolean, fontSize = 17) {
    const root = new Container();
    const bg = new Graphics();
    const shape = bg.roundRect(0, 0, width, height, 13);
    if (style === 'gold') shape.fill(this.gold);
    else if (style === 'ghost') {
      shape.fill({ color: 0xffffff, alpha: 0.04 });
      bg.roundRect(0.5, 0.5, width - 1, height - 1, 13).stroke({ width: 1, color: 0x3b5578 });
    } else if (style === 'up') shape.fill(0x166534);
    else if (style === 'down') shape.fill(0x7f1d1d);
    else shape.fill(COLOR.key);
    const label = this.label(caption, {
      fontSize,
      fontWeight: '800',
      fill: style === 'gold' ? COLOR.ink : COLOR.cream,
    });
    label.anchor.set(0.5);
    label.position.set(width / 2, height / 2);
    if (label.width > width - 12) label.scale.set((width - 12) / label.width);
    root.addChild(bg, label);
    root.alpha = enabled ? 1 : 0.38;
    root.eventMode = enabled ? 'static' : 'none';
    root.cursor = enabled ? 'pointer' : 'default';
    return root;
  }
}

type ButtonStyle = 'gold' | 'dark' | 'ghost' | 'up' | 'down';
