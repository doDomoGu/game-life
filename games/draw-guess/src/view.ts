export interface StrokeView {
  id: string;
  tool: 'pen' | 'eraser';
  color: string;
  points: Array<{ x: number; y: number }>;
}

export interface BubbleView {
  kind: 'wrong' | 'correct';
  text?: string;
  until?: number;
}

export interface PlayerView {
  userId: string;
  username: string;
  connected: boolean;
  score: number;
  roundScore: number | null;
  correct: boolean;
  bubble: BubbleView | null;
}

export interface RoundView {
  index: number;
  word: string;
  drawerId: string;
  scores: Record<string, number>;
}

export interface RankView {
  userId: string;
  username: string;
  score: number;
  rank: number;
}

export interface DrawGuessView {
  code: string;
  phase: 'draw' | 'reveal' | 'settlement';
  roundIndex: number;
  roundCount: number;
  endsAt: number;
  serverNow: number;
  drawerId: string;
  wordLength: number;
  word: string | null;
  strokes: StrokeView[];
  players: PlayerView[];
  rounds: RoundView[];
  ranking: RankView[] | null;
}
