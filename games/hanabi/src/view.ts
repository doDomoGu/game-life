import type { Color } from './colors.js';

export interface ActionLog {
  type: 'hint' | 'discard' | 'play';
  actorId: string;
  targetPlayerId?: string;
  hintType?: 'color' | 'value';
  hintValue?: Color | number;
  cardIndexes?: number[];
  card?: { color: Color; value: number };
  success?: boolean;
  at: number;
}

export interface CardView {
  id: string;
  color?: Color;
  value?: number;
  hints?: { color: Color | null; value: number | null };
}

export interface GameView {
  discard: Array<{ id: string; color: Color; value: number }>;
  fireworks: Record<Color, number>;
  hints: number;
  fuses: number;
  turnIndex: number;
  currentPlayerId: string;
  playerOrder: string[];
  hands: Record<string, CardView[]>;
  deckCount: number;
  lastActions: ActionLog[];
  phase: 'normal' | 'finalRound';
  finalTurnsLeft: number | null;
  score: number | null;
  scoreLabel: string | null;
  result: 'win' | 'lose' | 'score' | null;
}

export interface HanabiView {
  code: string;
  hostUserId: string;
  players: Array<{ userId: string; username: string; connected: boolean }>;
  game: GameView;
}
