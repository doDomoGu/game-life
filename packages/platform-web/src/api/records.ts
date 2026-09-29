import type { GameRecord, MyStats, PaginatedRecords, SubmitRecordBody } from '@game-life/shared';
import { api } from './client';

export async function submitRecord(gameId: string, body: SubmitRecordBody) {
  const { data } = await api.post<GameRecord>(`/games/${gameId}/records`, body);
  return data;
}

export async function fetchMyRecords(params?: { gameId?: string; page?: number }) {
  const { data } = await api.get<PaginatedRecords>('/me/records', { params });
  return data;
}

export async function fetchMyStats(gameId?: string) {
  const { data } = await api.get<MyStats>('/me/stats', { params: { gameId } });
  return data;
}
