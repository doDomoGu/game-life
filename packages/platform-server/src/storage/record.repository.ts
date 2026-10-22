import path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { GameRecord } from '@game-life/shared';
import { getPlatformRuntime } from '../config/runtime.js';
import { readJsonFile, writeJsonFileAtomic } from './fileStore.js';

const file = () => path.join(getPlatformRuntime().dataDir, 'records.json');

type RecordsFile = { records: GameRecord[] };

// 同一进程内的追加必须串行：并发 read-modify-write 会互相覆盖（多人同时结算时丢记录）
let appendChain: Promise<unknown> = Promise.resolve();

export function appendRecord(
  partial: Omit<GameRecord, 'id' | 'playedAt'> & { playedAt?: string },
): Promise<GameRecord> {
  const run = async (): Promise<GameRecord> => {
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
  };

  const task = appendChain.then(run, run);
  appendChain = task.catch(() => undefined);
  return task;
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
