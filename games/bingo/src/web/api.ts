import { api } from '@game-life/platform-web';

export interface BingoRoomView {
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  hostUserId: string;
  players: Array<{
    userId: string;
    username: string;
    role: 'host' | 'guest';
  }>;
  drawnItemIds: number[];
  currentItemId: number | null;
  itemLabels: readonly string[];
  winner: { userId: string; username: string } | null;
  myBoard: number[] | null;
  myMarked: boolean[] | null;
}

const base = '/games/bingo/rooms';

export async function fetchBingoRoom(code: string) {
  const { data } = await api.get<BingoRoomView>(`${base}/${encodeURIComponent(code)}`);
  return data;
}

export async function drawBingoRoom(code: string) {
  const { data } = await api.post<BingoRoomView>(`${base}/${encodeURIComponent(code)}/draw`);
  return data;
}
