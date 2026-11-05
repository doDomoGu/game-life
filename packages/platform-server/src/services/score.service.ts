import type {
  GameRecord,
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardStyle,
  MyGameScore,
  SudokuDifficulty,
  SudokuProgress,
} from '@game-life/shared';
import { getGame, listGames } from '../games/registry.js';
import * as recordRepo from '../storage/record.repository.js';
import * as userRepo from '../storage/user.repository.js';

const SUDOKU_GAME_ID = 'sudoku';
const SUDOKU_TOTAL = 30;
const SUDOKU_DIFFICULTIES: SudokuDifficulty[] = ['easy', 'normal', 'hard'];
const LEADERBOARD_LIMIT = 20;

/** 服务端只知道游戏 id，积分展示口径在这里统一维护 */
const SCORE_STYLES: Record<string, LeaderboardStyle> = {
  'poker-memory': 'best',
  klotski: 'best',
  sudoku: 'sudoku',
  bingo: 'wins',
  'mahjong-wind': 'wins',
  'mahjong-score': 'score',
  'color-guess': 'wins',
  hanabi: 'score',
  'draw-guess': 'score',
};

interface UserStats {
  userId: string;
  username: string;
  games: number;
  wins: number;
  bestTimeMs: number | null;
  bestScore: number | null;
  bestRawMin: number | null;
  sudoku: Record<SudokuDifficulty, Map<number, number>>;
  lastPlayedAt: string | null;
}

interface SudokuRecordMeta {
  difficulty: SudokuDifficulty;
  puzzleId: number;
  timeMs: number;
}

function styleOf(gameId: string, records: GameRecord[]): LeaderboardStyle {
  const fixed = SCORE_STYLES[gameId];
  if (fixed) return fixed;
  return records.some((record) => typeof record.meta?.won === 'boolean') ? 'wins' : 'time';
}

function timeMsOf(record: GameRecord): number | null {
  if (typeof record.durationMs === 'number' && record.durationMs > 0) return record.durationMs;
  if (typeof record.rawScore === 'number' && record.rawScore > 0) return record.rawScore * 1000;
  return null;
}

function sudokuMetaOf(record: GameRecord): SudokuRecordMeta | null {
  const difficulty = record.meta?.difficulty;
  if (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'hard') return null;
  const puzzleId = Number(record.meta?.puzzleId);
  if (!Number.isInteger(puzzleId) || puzzleId < 1 || puzzleId > SUDOKU_TOTAL) return null;
  const timeMs = timeMsOf(record);
  if (!timeMs) return null;
  return { difficulty, puzzleId, timeMs };
}

function emptySudoku(): Record<SudokuDifficulty, Map<number, number>> {
  return {
    easy: new Map(),
    normal: new Map(),
    hard: new Map(),
  };
}

async function collectStats(gameId: string, records: GameRecord[]): Promise<Map<string, UserStats>> {
  const users = await userRepo.listUsers();
  const names = new Map(users.map((user) => [user.id, user.nickname || user.username]));
  const stats = new Map<string, UserStats>();
  for (const record of records) {
    let entry = stats.get(record.userId);
    if (!entry) {
      entry = {
        userId: record.userId,
        username: names.get(record.userId) ?? record.userId,
        games: 0,
        wins: 0,
        bestTimeMs: null,
        bestScore: null,
        bestRawMin: null,
        sudoku: emptySudoku(),
        lastPlayedAt: null,
      };
      stats.set(record.userId, entry);
    }
    entry.games += 1;
    if (typeof record.meta?.won === 'boolean' && record.meta.won) entry.wins += 1;
    const timeMs = timeMsOf(record);
    if (timeMs != null) {
      entry.bestTimeMs = entry.bestTimeMs == null ? timeMs : Math.min(entry.bestTimeMs, timeMs);
    }
    entry.bestScore =
      entry.bestScore == null ? record.rawScore : Math.max(entry.bestScore, record.rawScore);
    entry.bestRawMin =
      entry.bestRawMin == null ? record.rawScore : Math.min(entry.bestRawMin, record.rawScore);
    if (!entry.lastPlayedAt || record.playedAt > entry.lastPlayedAt) {
      entry.lastPlayedAt = record.playedAt;
    }
    if (gameId === SUDOKU_GAME_ID) {
      const meta = sudokuMetaOf(record);
      if (meta) {
        const current = entry.sudoku[meta.difficulty].get(meta.puzzleId);
        if (current == null || meta.timeMs < current) {
          entry.sudoku[meta.difficulty].set(meta.puzzleId, meta.timeMs);
        }
      }
    }
  }
  return stats;
}

function progressOf(stats: UserStats, difficulty: SudokuDifficulty): SudokuProgress {
  const puzzles = [...stats.sudoku[difficulty].entries()]
    .map(([id, bestTimeMs]) => ({ id, bestTimeMs }))
    .sort((a, b) => a.id - b.id);
  const totalBestMs = puzzles.reduce((sum, item) => sum + item.bestTimeMs, 0);
  const bestTimeMs = puzzles.reduce<number | null>(
    (best, item) => (best == null ? item.bestTimeMs : Math.min(best, item.bestTimeMs)),
    null,
  );
  return {
    difficulty,
    completed: puzzles.length,
    total: SUDOKU_TOTAL,
    bestTimeMs,
    totalBestMs: puzzles.length ? totalBestMs : null,
    puzzles,
  };
}

function entryOf(stats: UserStats, style: LeaderboardStyle): LeaderboardEntry {
  if (style === 'sudoku') {
    return {
      rank: 0,
      userId: stats.userId,
      username: stats.username,
      games: 0,
      wins: 0,
      bestTimeMs: null,
      bestScore: null,
      sudokuCompleted: 0,
      sudokuBestTimeMs: null,
      sudokuTotalBestMs: null,
    };
  }
  return {
    rank: 0,
    userId: stats.userId,
    username: stats.username,
    games: stats.games,
    wins: stats.wins,
    bestTimeMs: style === 'time' ? stats.bestTimeMs : null,
    bestScore:
      style === 'score' ? stats.bestScore : style === 'best' ? stats.bestRawMin : null,
    sudokuCompleted: null,
    sudokuBestTimeMs: null,
    sudokuTotalBestMs: null,
  };
}

function rankEntries(entries: LeaderboardEntry[], style: LeaderboardStyle): LeaderboardEntry[] {
  entries.sort((a, b) => {
    if (style === 'wins') {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.games !== a.games) return b.games - a.games;
    } else if (style === 'score') {
      if ((b.bestScore ?? -Infinity) !== (a.bestScore ?? -Infinity)) {
        return (b.bestScore ?? -Infinity) - (a.bestScore ?? -Infinity);
      }
      if (b.games !== a.games) return b.games - a.games;
    } else if (style === 'best') {
      const av = a.bestScore ?? Number.POSITIVE_INFINITY;
      const bv = b.bestScore ?? Number.POSITIVE_INFINITY;
      if (av !== bv) return av - bv;
      if (b.games !== a.games) return b.games - a.games;
    } else {
      const at = a.bestTimeMs ?? Number.POSITIVE_INFINITY;
      const bt = b.bestTimeMs ?? Number.POSITIVE_INFINITY;
      if (at !== bt) return at - bt;
      if (b.games !== a.games) return b.games - a.games;
    }
    return a.username.localeCompare(b.username);
  });
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });
  return entries;
}

function sudokuEntry(stats: UserStats, difficulty: SudokuDifficulty): LeaderboardEntry {
  const progress = progressOf(stats, difficulty);
  return {
    rank: 0,
    userId: stats.userId,
    username: stats.username,
    games: progress.completed,
    wins: 0,
    bestTimeMs: progress.bestTimeMs,
    bestScore: null,
    sudokuCompleted: progress.completed,
    sudokuBestTimeMs: progress.bestTimeMs,
    sudokuTotalBestMs: progress.totalBestMs,
  };
}

function rankSudoku(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  entries.sort((a, b) => {
    const ac = a.sudokuCompleted ?? 0;
    const bc = b.sudokuCompleted ?? 0;
    if (bc !== ac) return bc - ac;
    const at = a.sudokuTotalBestMs ?? Number.POSITIVE_INFINITY;
    const bt = b.sudokuTotalBestMs ?? Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    const ab = a.sudokuBestTimeMs ?? Number.POSITIVE_INFINITY;
    const bb = b.sudokuBestTimeMs ?? Number.POSITIVE_INFINITY;
    if (ab !== bb) return ab - bb;
    return a.username.localeCompare(b.username);
  });
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });
  return entries;
}

export async function leaderboardForGame(
  gameId: string,
  userId: string,
  difficulty: SudokuDifficulty = 'easy',
): Promise<LeaderboardResponse> {
  const game = getGame(gameId);
  if (!game) throw Object.assign(new Error('游戏不存在'), { statusCode: 404 });
  const records = await recordRepo.listRecordsByGame(gameId);
  const style = styleOf(gameId, records);
  const stats = await collectStats(gameId, records);

  if (style === 'sudoku') {
    const all = [...stats.values()]
      .map((item) => sudokuEntry(item, difficulty))
      .filter((entry) => (entry.sudokuCompleted ?? 0) > 0);
    const ranked = rankSudoku(all);
    return {
      gameId,
      gameName: game.name,
      style,
      difficulty,
      entries: ranked.slice(0, LEADERBOARD_LIMIT),
      me: ranked.find((entry) => entry.userId === userId) ?? null,
    };
  }

  const ranked = rankEntries(
    [...stats.values()].map((item) => entryOf(item, style)),
    style,
  );
  return {
    gameId,
    gameName: game.name,
    style,
    difficulty: null,
    entries: ranked.slice(0, LEADERBOARD_LIMIT),
    me: ranked.find((entry) => entry.userId === userId) ?? null,
  };
}

export async function myScores(userId: string): Promise<MyGameScore[]> {
  const records = (await recordRepo.listAllRecords()).filter((record) => record.userId === userId);
  const byGame = new Map<string, GameRecord[]>();
  for (const record of records) {
    const list = byGame.get(record.gameId);
    if (list) list.push(record);
    else byGame.set(record.gameId, [record]);
  }

  return listGames().map((game) => {
    const list = byGame.get(game.id) ?? [];
    const style = styleOf(game.id, list);
    if (style === 'sudoku') {
      const stats: UserStats = {
        userId,
        username: '',
        games: list.length,
        wins: 0,
        bestTimeMs: null,
        bestScore: null,
        bestRawMin: null,
        sudoku: emptySudoku(),
        lastPlayedAt: null,
      };
      for (const record of list) {
        const meta = sudokuMetaOf(record);
        if (!meta) continue;
        const current = stats.sudoku[meta.difficulty].get(meta.puzzleId);
        if (current == null || meta.timeMs < current) {
          stats.sudoku[meta.difficulty].set(meta.puzzleId, meta.timeMs);
        }
      }
      const progress = SUDOKU_DIFFICULTIES.map((difficulty) => progressOf(stats, difficulty));
      return {
        gameId: game.id,
        gameName: game.name,
        style: 'sudoku' as const,
        totalGames: list.length,
        wins: null,
        bestTimeMs: progress.reduce<number | null>(
          (best, item) =>
            item.bestTimeMs == null
              ? best
              : best == null
                ? item.bestTimeMs
                : Math.min(best, item.bestTimeMs),
          null,
        ),
        bestScore: null,
        sudoku: progress,
      };
    }

    let wins = 0;
    let bestTimeMs: number | null = null;
    let bestScore: number | null = null;
    let bestRawMin: number | null = null;
    for (const record of list) {
      if (record.meta?.won === true) wins += 1;
      const timeMs = timeMsOf(record);
      if (timeMs != null) {
        bestTimeMs = bestTimeMs == null ? timeMs : Math.min(bestTimeMs, timeMs);
      }
      bestScore = bestScore == null ? record.rawScore : Math.max(bestScore, record.rawScore);
      bestRawMin = bestRawMin == null ? record.rawScore : Math.min(bestRawMin, record.rawScore);
    }
    return {
      gameId: game.id,
      gameName: game.name,
      style,
      totalGames: list.length,
      wins: style === 'wins' ? wins : null,
      bestTimeMs: style === 'time' ? bestTimeMs : null,
      bestScore: style === 'score' ? bestScore : style === 'best' ? bestRawMin : null,
      sudoku: null,
    };
  });
}
