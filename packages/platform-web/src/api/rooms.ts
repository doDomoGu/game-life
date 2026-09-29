import { api } from './client.js';

export interface RoomPlayer {
  userId: string;
  username: string;
  role: 'host' | 'guest';
}

export interface RoomView {
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  hostUserId: string;
  gameId: string | null;
  gameName: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  players: RoomPlayer[];
  playerCount: number;
}

export async function fetchRooms() {
  const { data } = await api.get<{ mine: RoomView | null; waiting: RoomView[] }>('/rooms');
  return data;
}

export async function createRoom() {
  const { data } = await api.post<RoomView>('/rooms');
  return data;
}

export async function joinRoom(code: string) {
  const { data } = await api.post<RoomView>(`/rooms/${encodeURIComponent(code)}/join`);
  return data;
}

export async function leaveRoom() {
  await api.post('/rooms/leave');
}

export async function fetchRoom(code: string) {
  const { data } = await api.get<RoomView>(`/rooms/${encodeURIComponent(code)}`);
  return data;
}

export async function selectRoomGame(code: string, gameId: string) {
  const { data } = await api.post<RoomView>(`/rooms/${encodeURIComponent(code)}/game`, { gameId });
  return data;
}

export async function startRoom(code: string) {
  const { data } = await api.post<RoomView>(`/rooms/${encodeURIComponent(code)}/start`);
  return data;
}

export async function finishRoom(code: string) {
  const { data } = await api.post<RoomView>(`/rooms/${encodeURIComponent(code)}/finish`);
  return data;
}

export async function resetRoom(code: string) {
  const { data } = await api.post<RoomView>(`/rooms/${encodeURIComponent(code)}/reset`);
  return data;
}
