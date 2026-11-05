export type Suit = 'm' | 'p' | 's' | 'z';
export type WinType = 'ron' | 'tsumo';
export type WaitType = '两面听' | '边张' | '坎张' | '单骑听牌' | '双碰听';

export interface WinTileGroup {
  kind: 'mentsu' | 'pair';
  subtype: 'shun' | 'triplet' | 'kan' | null;
  open?: boolean;
  tiles: string[];
}

export interface HandFacts {
  groups: string[];
  pair: string;
  hands: string[];
  openMelds: string[];
  concealedKans: string[];
  winTile: string;
  winType: WinType;
  waitType: WaitType;
  riichi: boolean;
  ippatsu: boolean;
  honba: number;
  dealer: boolean;
  doraIndicators: string[];
  uraDoraIndicators: string[];
  redDoraCount: number;
}

export interface PointAnswer {
  ron?: number;
  each?: number;
  child?: number;
  dealer?: number;
  base: number;
  limitLabel: string;
}

export interface Question extends HandFacts {
  doraCount: number;
  yaku: string[];
  han: number;
  fu: number;
  fuDetails: string[];
  answer: PointAnswer;
}

export const YAKU_OPTIONS = [
  { label: '立直', closedHan: 1, openHan: undefined as number | undefined },
  { label: '一发', closedHan: 1, openHan: undefined },
  { label: '门清自摸', closedHan: 1, openHan: undefined },
  { label: '断幺九', closedHan: 1, openHan: 1 },
  { label: '平和', closedHan: 1, openHan: undefined },
  { label: '一盃口', closedHan: 1, openHan: undefined },
  { label: '役牌', closedHan: 1, openHan: 1 },
  { label: '三色同顺', closedHan: 2, openHan: 1 },
  { label: '三色同刻', closedHan: 2, openHan: 2 },
  { label: '一气通贯', closedHan: 2, openHan: 1 },
  { label: '七对子', closedHan: 2, openHan: undefined },
  { label: '对对和', closedHan: 2, openHan: 2 },
  { label: '三暗刻', closedHan: 2, openHan: 2 },
  { label: '混全带幺九', closedHan: 2, openHan: 1 },
  { label: '混一色', closedHan: 3, openHan: 2 },
  { label: '纯全带幺九', closedHan: 3, openHan: 2 },
  { label: '二杯口', closedHan: 3, openHan: undefined },
  { label: '清一色', closedHan: 6, openHan: 5 },
] as const;
