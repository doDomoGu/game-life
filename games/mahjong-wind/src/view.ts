export type Wind = 'E' | 'S' | 'W' | 'N';

export const WIND_ORDER: Wind[] = ['E', 'S', 'W', 'N'];
export const WIND_LABEL: Record<Wind, string> = { E: '东', S: '南', W: '西', N: '北' };

export type SettleKind = 'win' | 'draw';

export interface SettleInput {
  value: number;
  confirmed: boolean;
}

export interface SettleView {
  kind: SettleKind;
  /** 和牌：亲家和了；流局：亲家听牌 */
  dealerFlag: boolean;
  inputs: Record<string, SettleInput>;
  error: string;
}

export interface ResultRow {
  id: string;
  rank: number;
  score: number;
  uma: number;
  pt: number;
}

export interface NextHand {
  roundWind: Wind;
  kyoku: number;
  dealerWind: Wind;
  honba: number;
  /** 南 4 局已下庄，只能结束对局 */
  over: boolean;
}

export interface GameView {
  seats: Record<Wind, string>;
  roundWind: Wind;
  kyoku: number;
  honba: number;
  kyotaku: number;
  dealerWind: Wind;
  scores: Record<string, number>;
  riichi: Record<string, boolean>;
  phase: 'playing' | 'settling' | 'handEnd' | 'finished';
  settle: SettleView | null;
  next: NextHand | null;
  results: ResultRow[] | null;
  /** 本局进行中且不是第一局，可以回到上一局 */
  canGoBack: boolean;
}

export interface MahjongWindView {
  code: string;
  hostUserId: string;
  players: Array<{ userId: string; username: string; connected: boolean }>;
  game: GameView;
}

export function windOf(seats: Record<Wind, string>, playerId: string): Wind | null {
  return WIND_ORDER.find((wind) => seats[wind] === playerId) ?? null;
}

export function formatRound(roundWind: Wind, kyoku: number): string {
  return `${WIND_LABEL[roundWind]} ${kyoku} 局`;
}

export function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function formatPt(pt: number): string {
  const rounded = Math.round(pt * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return Number.isInteger(rounded) ? `${sign}${rounded}` : `${sign}${rounded.toFixed(1)}`;
}
