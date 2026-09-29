import { POKER_MEMORY_GAME_ID, type GameRecord, type MyStats, type SubmitRecordBody } from '@game-life/shared';
import { getGame, validateSubmit } from '../games/registry.js';
import * as recordRepo from '../storage/record.repository.js';

export async function submitRecord(
  userId: string,
  gameId: string,
  body: SubmitRecordBody,
): Promise<GameRecord> {
  if (!getGame(gameId)) {
    throw Object.assign(new Error('游戏不存在'), { statusCode: 404 });
  }
  const err = validateSubmit(gameId, body.rawScore, body.durationMs);
  if (err) {
    throw Object.assign(new Error(err), { statusCode: 400 });
  }
  return recordRepo.appendRecord({
    userId,
    gameId,
    rawScore: body.rawScore,
    durationMs: body.durationMs,
    meta: body.meta,
  });
}

export async function getMyRecords(
  userId: string,
  query: { gameId?: string; page: number; pageSize: number },
) {
  const { items, total } = await recordRepo.listRecordsByUser(userId, query);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getMyStats(userId: string, gameId: string = POKER_MEMORY_GAME_ID): Promise<MyStats> {
  const { items } = await recordRepo.listRecordsByUser(userId, {
    gameId,
    page: 1,
    pageSize: 10_000,
  });
  if (items.length === 0) {
    return { gameId, totalGames: 0, bestFlipTurns: null, lastPlayedAt: null };
  }
  const bestFlipTurns = Math.min(...items.map((r) => r.rawScore));
  return {
    gameId,
    totalGames: items.length,
    bestFlipTurns,
    lastPlayedAt: items[0]?.playedAt ?? null,
  };
}
