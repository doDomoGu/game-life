export type ColorGuessMode = 'solo' | 'race' | 'setter';

export type ColorGuessPhase = 'setup' | 'setter' | 'guessing' | 'finished';

export type ColorGuessResult = 'win' | 'lose' | 'draw' | null;

export interface ColorGuessConfig {
  mode: ColorGuessMode;
  paletteSize: 8 | 10;
  allowDuplicates: boolean;
  /** setter 模式下是 'random' 或具体玩家 id */
  setterChoice: 'random' | string;
}

export interface AttemptView {
  colors: number[];
  exact: number;
  partial: number;
}

export interface BoardView {
  userId: string;
  username: string;
  attempts: AttemptView[];
  solved: boolean;
}

export interface ColorGuessPlayer {
  userId: string;
  username: string;
  role: 'host' | 'guest';
}

export type ColorGuessRole = 'solo' | 'setter' | 'guesser' | 'spectator';

export interface ColorGuessView {
  code: string;
  hostUserId: string;
  players: ColorGuessPlayer[];
  phase: ColorGuessPhase;
  config: ColorGuessConfig;
  /** 只有出题者（出题后）和结算后能看到 */
  secret: number[] | null;
  setterId: string | null;
  guesserId: string | null;
  turnUserId: string | null;
  boards: Record<string, BoardView>;
  winnerId: string | null;
  result: ColorGuessResult;
  /** 全局猜测上限：单人/出题 10 次，竞速共 10 轮 */
  maxAttempts: number;
  /** 当前玩家每个棋盘可用的次数：竞速 5，其他 10 */
  attemptLimit: number;
  canConfig: boolean;
  youRole: ColorGuessRole;
}
