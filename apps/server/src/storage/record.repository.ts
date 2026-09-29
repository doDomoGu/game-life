import path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { GameRecord } from '@game-life/shared';
import { env } from '../config/env.js';
import { readJsonFile, writeJsonFileAtomic } from './fileStore.js';

const file = () => path.join(env.dataDir, 'records.json');

type RecordsFile = { records: GameRecord[] };

export async function appendRecord(
  partial: Omit<GameRecord, 'id' | 'playedAt'> & { playedAt?: string },
): Promise<GameRecord> {
  const data = await readJsonFile<RecordsFile>(file(), { records: [] });
  const record: GameRecord = {
    id: uuid(),
    playedAt: partial.playedAt ?? new Date().toISOString(),
    userId: partial.userId,
    gameId: partial.gameId,
    rawScore: partial.rawScore,
    durationMs: partial.durationMs,
    meta: partial.meta,
  };
  data.records.push(record);
  await writeJsonFileAtomic(file(), data);
  return record;
}

export async function listRecordsByUser(
  userId: string,
  opts: { gameId?: string; page: number; pageSize: number },
): Promise<{ items: GameRecord[]; total: number }> {
  const data = await readJsonFile<RecordsFile>(file(), { records: [] });
  let list = data.records.filter((r) => r.userId === userId);
  if (opts.gameId) {
    list = list.filter((r) => r.gameId === opts.gameId);
  }
  list.sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
  const total = list.length;
  const start = (opts.page - 1) * opts.pageSize;
  const items = list.slice(start, start + opts.pageSize);
  return { items, total };
}
