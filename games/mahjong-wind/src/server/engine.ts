import {
  WIND_ORDER,
  formatDelta,
  type GameView,
  type NextHand,
  type ResultRow,
  type SettleKind,
  type SettleView,
  type Wind,
} from '../view.js';

export const START_POINTS = 25000;
export const RETURN_POINTS = 30000;
export const RIICHI_COST = 1000;
const UMA = [50, 10, -10, -30];

interface Snapshot {
  roundWind: Wind;
  kyoku: number;
  honba: number;
  kyotaku: number;
  dealerWind: Wind;
  scores: Record<string, number>;
}

/** 一局对账入分后、开始下一局前的局面，回到上一局时整份恢复 */
interface HandEnd extends Snapshot {
  riichi: Record<string, boolean>;
  settle: SettleView;
  next: NextHand;
}

export interface GameState extends Snapshot {
  seats: Record<Wind, string>;
  riichi: Record<string, boolean>;
  /** handEnd：本局已对账入分，等大家选开始下一局或结束对局 */
  phase: 'playing' | 'settling' | 'handEnd' | 'finished';
  /** settling 时是正在填的分；handEnd 时保留本局各家的增减 */
  settle: SettleView | null;
  /** handEnd 时算好的下一局，开始下一局时才生效 */
  next: NextHand | null;
  results: ResultRow[] | null;
  /** 每局开局时的快照，最后一项是本局开局 */
  history: Snapshot[];
  /** 已打完各局的入分局面，比 history 少一项 */
  ended: HandEnd[];
}

export type SettleOutcome = 'pending' | 'retry' | 'handEnd';

function fail(message: string): never {
  throw new Error(message);
}

function seatedIds(game: GameState): string[] {
  return WIND_ORDER.map((wind) => game.seats[wind]);
}

function emptyRiichi(ids: string[]): Record<string, boolean> {
  return Object.fromEntries(ids.map((id) => [id, false]));
}

function snapshot(game: Snapshot): Snapshot {
  return {
    roundWind: game.roundWind,
    kyoku: game.kyoku,
    honba: game.honba,
    kyotaku: game.kyotaku,
    dealerWind: game.dealerWind,
    scores: { ...game.scores },
  };
}

function shuffled<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** 随机入座，东家坐亲，各 25000 点 */
export function startGame(playerIds: string[]): GameState {
  if (playerIds.length !== 4) fail('风向盘需要正好 4 人');
  const order = shuffled(playerIds);
  const seats = { E: order[0]!, S: order[1]!, W: order[2]!, N: order[3]! };
  const scores = Object.fromEntries(playerIds.map((id) => [id, START_POINTS]));
  const game: GameState = {
    seats,
    roundWind: 'E',
    kyoku: 1,
    honba: 0,
    kyotaku: 0,
    dealerWind: 'E',
    scores,
    riichi: emptyRiichi(playerIds),
    phase: 'playing',
    settle: null,
    next: null,
    results: null,
    history: [],
    ended: [],
  };
  game.history.push(snapshot(game));
  return game;
}

function ensureSeated(game: GameState, playerId: string) {
  if (game.scores[playerId] == null) fail('你不在这桌');
}

function handStart(game: GameState): Snapshot {
  return game.history[game.history.length - 1]!;
}

function cloneSettle(settle: SettleView): SettleView {
  return {
    ...settle,
    inputs: Object.fromEntries(Object.entries(settle.inputs).map(([id, input]) => [id, { ...input }])),
  };
}

export function declareRiichi(game: GameState, playerId: string) {
  if (game.phase !== 'playing') fail('现在不能立直');
  ensureSeated(game, playerId);
  if (game.riichi[playerId]) fail('本局已经立直');
  if ((game.scores[playerId] ?? 0) < RIICHI_COST) fail('点数不足 1000');
  game.scores[playerId] = (game.scores[playerId] ?? 0) - RIICHI_COST;
  game.kyotaku += RIICHI_COST;
  game.riichi[playerId] = true;
}

export function cancelRiichi(game: GameState, playerId: string) {
  if (game.phase !== 'playing') fail('现在不能取消立直');
  ensureSeated(game, playerId);
  if (!game.riichi[playerId]) fail('本局尚未立直');
  game.scores[playerId] = (game.scores[playerId] ?? 0) + RIICHI_COST;
  game.kyotaku = Math.max(0, game.kyotaku - RIICHI_COST);
  game.riichi[playerId] = false;
}

/** 亲家已立直时，流局一定算亲家听牌 */
export function dealerLocked(game: GameState): boolean {
  return Boolean(game.riichi[game.seats[game.dealerWind]]);
}

export function startSettle(game: GameState, kind: SettleKind, dealerFlag: boolean) {
  if (game.phase !== 'playing') fail('现在不能发起结算');
  if (kind !== 'win' && kind !== 'draw') fail('请选择有人和牌或流局');
  const flag = kind === 'draw' && dealerLocked(game) ? true : Boolean(dealerFlag);
  game.phase = 'settling';
  game.settle = {
    kind,
    dealerFlag: flag,
    inputs: Object.fromEntries(seatedIds(game).map((id) => [id, { value: 0, confirmed: false }])),
    error: '',
  };
}

export function cancelSettle(game: GameState) {
  if (game.phase !== 'settling') fail('没有进行中的结算');
  game.phase = 'playing';
  game.settle = null;
}

export function submitSettle(game: GameState, playerId: string, value: number): SettleOutcome {
  const settle = game.settle;
  if (game.phase !== 'settling' || !settle) fail('还没有发起结算');
  ensureSeated(game, playerId);
  if (!Number.isInteger(value) || Math.abs(value) > 200_000) fail('请输入整数点数');
  settle.inputs[playerId] = { value, confirmed: true };
  settle.error = '';
  const ids = seatedIds(game);
  if (!ids.every((id) => settle.inputs[id]?.confirmed)) return 'pending';
  return applySettle(game);
}

function applySettle(game: GameState): SettleOutcome {
  const settle = game.settle!;
  const ids = seatedIds(game);
  const sum = ids.reduce((total, id) => total + (settle.inputs[id]?.value ?? 0), 0);
  const expected = settle.kind === 'win' ? game.kyotaku : 0;
  if (sum !== expected) {
    settle.error =
      settle.kind === 'win'
        ? `四家合计 ${formatDelta(sum)}，和牌时应等于供托 ${game.kyotaku}`
        : `四家合计 ${formatDelta(sum)}，流局应为 0；供托 ${game.kyotaku} 留到下一局`;
    for (const id of ids) {
      const input = settle.inputs[id];
      if (input) input.confirmed = false;
    }
    return 'retry';
  }

  for (const id of ids) game.scores[id] = (game.scores[id] ?? 0) + (settle.inputs[id]?.value ?? 0);
  if (settle.kind === 'win') game.kyotaku = 0;
  game.next = nextHand(game, settle.kind, settle.dealerFlag);
  game.phase = 'handEnd';
  return 'handEnd';
}

/** 亲家和牌或流局听牌连庄；否则下庄。南 4 局下庄时 over 为 true，半庄打满 */
function nextHand(game: GameState, kind: SettleKind, renchan: boolean): NextHand {
  const honba = renchan || kind === 'draw' ? game.honba + 1 : 0;
  if (renchan) {
    return { roundWind: game.roundWind, kyoku: game.kyoku, dealerWind: game.dealerWind, honba, over: false };
  }
  if (game.roundWind === 'S' && game.kyoku === 4) {
    return { roundWind: 'S', kyoku: 4, dealerWind: game.dealerWind, honba, over: true };
  }
  const dealerWind = WIND_ORDER[(WIND_ORDER.indexOf(game.dealerWind) + 1) % 4]!;
  const rollover = game.roundWind === 'E' && game.kyoku === 4;
  return {
    roundWind: rollover ? 'S' : game.roundWind,
    kyoku: rollover ? 1 : game.kyoku + 1,
    dealerWind,
    honba,
    over: false,
  };
}

export function startNextHand(game: GameState) {
  if (game.phase !== 'handEnd' || !game.next) fail('本局还没有结算完');
  if (game.next.over) fail('南 4 局已打完，请结束对局');
  game.ended.push({
    ...snapshot(game),
    riichi: { ...game.riichi },
    settle: cloneSettle(game.settle!),
    next: { ...game.next },
  });
  const { roundWind, kyoku, dealerWind, honba } = game.next;
  Object.assign(game, { roundWind, kyoku, dealerWind, honba });
  game.next = null;
  game.settle = null;
  game.riichi = emptyRiichi(Object.keys(game.scores));
  game.phase = 'playing';
  game.history.push(snapshot(game));
}

/** 结算中或已入分：回到本局开局时的点数和供托，本局的立直和结算作废 */
export function undoHand(game: GameState) {
  if (game.phase !== 'settling' && game.phase !== 'handEnd') fail('现在不能撤销本局');
  Object.assign(game, snapshot(handStart(game)));
  game.riichi = emptyRiichi(Object.keys(game.scores));
  game.settle = null;
  game.next = null;
  game.phase = 'playing';
}

/** 本局进行中：丢掉本局，回到上一局已入分、等开始下一局的局面 */
export function backToLastHand(game: GameState) {
  if (game.phase !== 'playing') fail('现在不能回到上一局');
  const last = game.ended.pop();
  if (!last) fail('这是第一局，没有上一局');
  game.history.pop();
  const { riichi, settle, next, ...rest } = last;
  Object.assign(game, snapshot(rest));
  game.riichi = riichi;
  game.settle = settle;
  game.next = next;
  game.phase = 'handEnd';
}

/** 同分时离起家（东）近的排前 */
function seatOrder(game: GameState, playerId: string): number {
  const index = WIND_ORDER.findIndex((wind) => game.seats[wind] === playerId);
  return index < 0 ? 99 : index;
}

function ranked(game: GameState): string[] {
  return Object.keys(game.scores).sort((a, b) => {
    const diff = (game.scores[b] ?? 0) - (game.scores[a] ?? 0);
    return diff !== 0 ? diff : seatOrder(game, a) - seatOrder(game, b);
  });
}

/** 同分的人平分顺位马，除不尽的余数按座次依次补给 */
function splitUma(game: GameState, order: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  let index = 0;
  while (index < order.length) {
    let end = index + 1;
    while (end < order.length && game.scores[order[end]!] === game.scores[order[index]!]) end += 1;
    const group = order.slice(index, end);
    const total = UMA.slice(index, end).reduce((sum, item) => sum + item, 0);
    const share = Math.trunc(total / group.length);
    let rest = total - share * group.length;
    for (const id of group) result[id] = share;
    let cursor = 0;
    while (rest !== 0) {
      const id = group[cursor % group.length]!;
      result[id] = (result[id] ?? 0) + Math.sign(rest);
      rest -= Math.sign(rest);
      cursor += 1;
    }
    index = end;
  }
  return result;
}

/** 结束整场对局：剩余供托归一位，按当前点数算名次和 pt。之后不能再改 */
export function endMatch(game: GameState) {
  if (game.phase !== 'handEnd') fail('一局结算完才能结束对局');
  const order = ranked(game);
  if (game.kyotaku > 0 && order[0]) {
    game.scores[order[0]] = (game.scores[order[0]] ?? 0) + game.kyotaku;
    game.kyotaku = 0;
  }
  const finalOrder = ranked(game);
  const uma = splitUma(game, finalOrder);
  let rank = 1;
  game.results = finalOrder.map((id, index) => {
    const score = game.scores[id] ?? 0;
    if (index > 0 && score < (game.scores[finalOrder[index - 1]!] ?? 0)) rank = index + 1;
    const umaValue = uma[id] ?? 0;
    return { id, rank, score, uma: umaValue, pt: (score - RETURN_POINTS) / 1000 + umaValue };
  });
  game.phase = 'finished';
  game.settle = null;
  game.next = null;
  game.riichi = emptyRiichi(Object.keys(game.scores));
}

export function viewGame(game: GameState): GameView {
  return {
    seats: { ...game.seats },
    roundWind: game.roundWind,
    kyoku: game.kyoku,
    honba: game.honba,
    kyotaku: game.kyotaku,
    dealerWind: game.dealerWind,
    scores: { ...game.scores },
    riichi: { ...game.riichi },
    phase: game.phase,
    settle: game.settle ? cloneSettle(game.settle) : null,
    next: game.next ? { ...game.next } : null,
    results: game.results ? game.results.map((row) => ({ ...row })) : null,
    canGoBack: game.phase === 'playing' && game.ended.length > 0,
  };
}
