export interface GameRecord {
  id: string;
  userId: string;
  gameId: string;
  /** 扑克记忆：配对完成时的「翻开次数」（每翻开 2 张计 1 次） */
  rawScore: number;
  durationMs?: number;
  playedAt: string;
  meta?: Record<string, unknown>;
}

export interface SubmitRecordBody {
  rawScore: number;
  durationMs?: number;
  meta?: Record<string, unknown>;
}

export interface PaginatedRecords {
  items: GameRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MyStats {
  gameId: string;
  totalGames: number;
  /** 比次数类游戏的个人最佳；对局胜负类游戏为 null */
  bestFlipTurns: number | null;
  /** 胜负类游戏的获胜次数；其它游戏为 null */
  wins: number | null;
  /** 一起玩过的对手用户名（去重） */
  opponents: string[];
  lastPlayedAt: string | null;
}
