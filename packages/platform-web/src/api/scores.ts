import type {
  LeaderboardResponse,
  MyGameScore,
  SudokuDifficulty,
} from '@game-life/shared';
import { api } from './client.js';

export async function fetchLeaderboard(
  gameId: string,
  difficulty?: SudokuDifficulty,
): Promise<LeaderboardResponse> {
  const { data } = await api.get<LeaderboardResponse>(
    `/games/${encodeURIComponent(gameId)}/leaderboard`,
    { params: difficulty ? { difficulty } : undefined },
  );
  return data;
}

export async function fetchMyScores(): Promise<MyGameScore[]> {
  const { data } = await api.get<{ games: MyGameScore[] }>('/me/scores');
  return data.games;
}
