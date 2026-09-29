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
  bestFlipTurns: number | null;
  lastPlayedAt: string | null;
}
