import type { GameRecord, MyStats, SubmitRecordBody } from '@game-life/shared';
import { getDefaultGameId, getGame, validateSubmit } from '../games/registry.js';
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

export async function getMyStats(userId: string, gameId?: string): Promise<MyStats> {
  const resolvedGameId = gameId ?? getDefaultGameId();
  if (!resolvedGameId) {
    return {
      gameId: '',
      totalGames: 0,
      bestFlipTurns: null,
      wins: null,
      opponents: [],
      lastPlayedAt: null,
    };
  }
  const { items } = await recordRepo.listRecordsByUser(userId, {
    gameId: resolvedGameId,
    page: 1,
    pageSize: 10_000,
  });
  if (items.length === 0) {
    return {
      gameId: resolvedGameId,
      totalGames: 0,
      bestFlipTurns: null,
      wins: null,
      opponents: [],
      lastPlayedAt: null,
    };
  }
  const matchRecords = items.filter((r) => typeof r.meta?.won === 'boolean');
  const wins = matchRecords.length > 0 ? matchRecords.filter((r) => r.meta?.won === true).length : null;
  const opponents = new Set<string>();
  for (const record of items) {
    const list = record.meta?.opponents;
    if (!Array.isArray(list)) continue;
    for (const opponent of list) {
      if (
        opponent &&
        typeof opponent === 'object' &&
        'username' in opponent &&
        typeof opponent.username === 'string' &&
        opponent.username
      ) {
        opponents.add(opponent.username);
      }
    }
  }
  const bestFlipTurns = wins == null ? Math.min(...items.map((r) => r.rawScore)) : null;
  return {
    gameId: resolvedGameId,
    totalGames: items.length,
    bestFlipTurns,
    wins,
    opponents: [...opponents],
    lastPlayedAt: items[0]?.playedAt ?? null,
  };
}
