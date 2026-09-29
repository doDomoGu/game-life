import { randomBytes } from 'node:crypto';
import { getServerGame } from '../games/registry.js';

export type RoomStatus = 'waiting' | 'playing' | 'finished';
export type PlayerRole = 'host' | 'guest';

export interface RoomPlayer {
  userId: string;
  username: string;
  role: PlayerRole;
}

export interface PlatformRoom {
  code: string;
  hostUserId: string;
  status: RoomStatus;
  gameId: string | null;
  players: RoomPlayer[];
  createdAt: number;
}

const rooms = new Map<string, PlatformRoom>();
const userRoom = new Map<string, string>();

function fail(message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode });
}

function randomCode(): string {
  return randomBytes(3).toString('hex').toUpperCase();
}

export function getRoom(code: string): PlatformRoom | undefined {
  return rooms.get(code.toUpperCase());
}

export function listWaitingRooms(): PlatformRoom[] {
  return [...rooms.values()].filter((room) => room.status === 'waiting');
}

function detachUser(userId: string) {
  userRoom.delete(userId);
}

function bindUser(userId: string, code: string) {
  userRoom.set(userId, code);
}

export function leaveRoom(userId: string): void {
  const code = userRoom.get(userId);
  if (!code) return;
  const room = rooms.get(code);
  detachUser(userId);
  if (!room) return;
  room.players = room.players.filter((p) => p.userId !== userId);
  if (room.players.length === 0) {
    rooms.delete(code);
    return;
  }
  if (room.hostUserId === userId) {
    const next = room.players[0];
    if (!next) return;
    room.hostUserId = next.userId;
    next.role = 'host';
    for (const player of room.players) {
      if (player.userId !== next.userId) player.role = 'guest';
    }
  }
}

function releaseIfIdle(userId: string) {
  const code = userRoom.get(userId);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) {
    detachUser(userId);
    return;
  }
  if (room.status === 'playing') {
    fail('你正在另一局对局中，请先结束或离开该房间', 409);
  }
  leaveRoom(userId);
}

export function createRoom(userId: string, username: string): PlatformRoom {
  releaseIfIdle(userId);
  let code = randomCode();
  while (rooms.has(code)) code = randomCode();
  const room: PlatformRoom = {
    code,
    hostUserId: userId,
    status: 'waiting',
    gameId: null,
    players: [{ userId, username, role: 'host' }],
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  bindUser(userId, code);
  return room;
}

export function joinRoom(code: string, userId: string, username: string): PlatformRoom {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  if (room.players.some((p) => p.userId === userId)) return room;
  if (room.status === 'playing') fail('对局进行中，无法加入', 400);
  const game = room.gameId ? getServerGame(room.gameId) : undefined;
  const cap = game?.maxPlayers ?? 8;
  if (room.players.length >= cap) fail(`房间已满（最多 ${cap} 人）`, 400);
  releaseIfIdle(userId);
  const fresh = getRoom(code);
  if (!fresh) fail('房间不存在', 404);
  if (fresh.players.some((p) => p.userId === userId)) return fresh;
  fresh.players.push({ userId, username, role: 'guest' });
  bindUser(userId, fresh.code);
  return fresh;
}

export function selectGame(code: string, hostUserId: string, gameId: string): PlatformRoom {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  if (room.hostUserId !== hostUserId) fail('仅房主可以选择游戏', 403);
  if (room.status !== 'waiting') fail('请先退出本局，再选择游戏', 400);
  const game = getServerGame(gameId);
  if (!game) fail('游戏不存在', 404);
  if (room.players.length > game.maxPlayers) {
    fail(`当前 ${room.players.length} 人，超过「${game.name}」上限 ${game.maxPlayers} 人`, 400);
  }
  room.gameId = gameId;
  return room;
}

export async function startRoom(code: string, hostUserId: string): Promise<PlatformRoom> {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  if (room.hostUserId !== hostUserId) fail('仅房主可以开始', 403);
  if (room.status !== 'waiting') fail('当前不能开始', 400);
  if (!room.gameId) fail('请先选择游戏', 400);
  const game = getServerGame(room.gameId);
  if (!game) fail('游戏不存在', 404);
  if (room.players.length < game.minPlayers) {
    fail(`「${game.name}」至少需要 ${game.minPlayers} 人`, 400);
  }
  if (room.players.length > game.maxPlayers) {
    fail(`「${game.name}」最多 ${game.maxPlayers} 人`, 400);
  }
  if (game.onStart) {
    await game.onStart({
      code: room.code,
      hostUserId: room.hostUserId,
      players: room.players.map((p) => ({ ...p })),
    });
  }
  room.status = 'playing';
  return room;
}

export function finishRoom(code: string, userId: string): PlatformRoom {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  if (!room.players.some((p) => p.userId === userId)) fail('你不在该房间', 403);
  if (room.status !== 'playing') fail('没有进行中的对局', 400);
  room.status = 'finished';
  return room;
}

export function resetRoom(code: string, userId: string): PlatformRoom {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  if (!room.players.some((p) => p.userId === userId)) fail('你不在该房间', 403);
  if (room.status !== 'finished') fail('本局尚未结束', 400);
  room.status = 'waiting';
  return room;
}

export function currentRoomOf(userId: string): PlatformRoom | undefined {
  const code = userRoom.get(userId);
  if (!code) return undefined;
  return rooms.get(code);
}
