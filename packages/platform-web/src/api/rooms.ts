import { api } from './client.js';

export type RoomStatus = 'waiting' | 'playing' | 'finished';
export type RoomVoteKind = 'end' | 'rematch';
export type RoomEndReason = 'finished' | 'aborted';

export interface RoomPlayer {
  userId: string;
  username: string;
  role: 'host' | 'guest';
  ready: boolean;
  connected: boolean;
}

export interface RoomVote {
  kind: RoomVoteKind;
  initiatorId: string;
  createdAt: number;
  expiresAt: number;
  votes: Record<string, 'yes' | 'no'>;
}

export interface RoomView {
  code: string;
  status: RoomStatus;
  hostUserId: string;
  gameId: string | null;
  gameName: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  players: RoomPlayer[];
  playerCount: number;
  roundId: number;
  vote: RoomVote | null;
  endReason: RoomEndReason | null;
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

export async function setRoomReady(code: string, ready: boolean) {
  const { data } = await api.post<RoomView>(`/rooms/${encodeURIComponent(code)}/ready`, { ready });
  return data;
}

export async function kickRoomPlayer(code: string, userId: string) {
  const { data } = await api.post<RoomView>(`/rooms/${encodeURIComponent(code)}/kick`, { userId });
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

export async function backToWaiting(code: string) {
  const { data } = await api.post<RoomView>(`/rooms/${encodeURIComponent(code)}/back-to-waiting`);
  return data;
}

export async function startEndVote(code: string) {
  const { data } = await api.post<RoomView>(`/rooms/${encodeURIComponent(code)}/end-vote`);
  return data;
}

export async function startRematchVote(code: string) {
  const { data } = await api.post<RoomView>(`/rooms/${encodeURIComponent(code)}/rematch-vote`);
  return data;
}

export async function castRoomVote(code: string, decision: 'yes' | 'no') {
  const { data } = await api.post<RoomView>(`/rooms/${encodeURIComponent(code)}/vote`, { decision });
  return data;
}

export async function cancelRoomVote(code: string) {
  const { data } = await api.delete<RoomView>(`/rooms/${encodeURIComponent(code)}/vote`);
  return data;
}
