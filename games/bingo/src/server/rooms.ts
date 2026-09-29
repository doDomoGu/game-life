import { randomBytes } from 'node:crypto';
import { applyDraw, checkWin, createDrawPool, createRandomBoard } from './engine.js';
import { BINGO_ITEM_COUNT } from '../items.js';
import { bingoMeta } from '../meta.js';

export type PlayerRole = 'host' | 'guest';
export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomPlayer {
  userId: string;
  username: string;
  role: PlayerRole;
  board: number[];
  marked: boolean[];
}

export interface BingoRoom {
  code: string;
  hostUserId: string;
  status: RoomStatus;
  players: RoomPlayer[];
  drawPool: number[];
  drawnItemIds: number[];
  currentItemId: number | null;
  winnerUserId: string | null;
  winnerUsername: string | null;
  createdAt: number;
}

const rooms = new Map<string, BingoRoom>();

function randomCode(): string {
  return randomBytes(3).toString('hex').toUpperCase();
}

function findRoom(code: string): BingoRoom | undefined {
  return rooms.get(code.toUpperCase());
}

export function createRoom(hostUserId: string, hostUsername: string): BingoRoom {
  let code = randomCode();
  while (rooms.has(code)) {
    code = randomCode();
  }
  const room: BingoRoom = {
    code,
    hostUserId,
    status: 'waiting',
    players: [
      {
        userId: hostUserId,
        username: hostUsername,
        role: 'host',
        board: createRandomBoard(),
        marked: Array(BINGO_ITEM_COUNT).fill(false),
      },
    ],
    drawPool: [],
    drawnItemIds: [],
    currentItemId: null,
    winnerUserId: null,
    winnerUsername: null,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export function joinRoom(code: string, userId: string, username: string): BingoRoom {
  const room = findRoom(code);
  if (!room) {
    throw Object.assign(new Error('房间不存在'), { statusCode: 404 });
  }
  if (room.status !== 'waiting') {
    throw Object.assign(new Error('对局已开始或已结束'), { statusCode: 400 });
  }
  if (room.players.some((p) => p.userId === userId)) {
    return room;
  }
  if (room.players.length >= bingoMeta.maxPlayers) {
    throw Object.assign(new Error('房间已满（最多 8 人）'), { statusCode: 400 });
  }
  room.players.push({
    userId,
    username,
    role: 'guest',
    board: createRandomBoard(),
    marked: Array(BINGO_ITEM_COUNT).fill(false),
  });
  return room;
}

export function startRoom(code: string, hostUserId: string): BingoRoom {
  const room = findRoom(code);
  if (!room) throw Object.assign(new Error('房间不存在'), { statusCode: 404 });
  if (room.hostUserId !== hostUserId) {
    throw Object.assign(new Error('仅房主可以开始游戏'), { statusCode: 403 });
  }
  if (room.status !== 'waiting') {
    throw Object.assign(new Error('对局状态无效'), { statusCode: 400 });
  }
  if (room.players.length < bingoMeta.minPlayers) {
    throw Object.assign(new Error('人数不足'), { statusCode: 400 });
  }
  for (const p of room.players) {
    p.board = createRandomBoard();
    p.marked = Array(BINGO_ITEM_COUNT).fill(false);
  }
  room.drawPool = createDrawPool();
  room.drawnItemIds = [];
  room.currentItemId = null;
  room.winnerUserId = null;
  room.winnerUsername = null;
  room.status = 'playing';
  return room;
}

export function drawNext(code: string, hostUserId: string): BingoRoom {
  const room = findRoom(code);
  if (!room) throw Object.assign(new Error('房间不存在'), { statusCode: 404 });
  if (room.hostUserId !== hostUserId) {
    throw Object.assign(new Error('仅房主可以开奖'), { statusCode: 403 });
  }
  if (room.status !== 'playing') {
    throw Object.assign(new Error('对局未进行中'), { statusCode: 400 });
  }
  if (room.winnerUserId) {
    throw Object.assign(new Error('已有获胜者'), { statusCode: 400 });
  }
  if (room.drawPool.length === 0) {
    throw Object.assign(new Error('所有图案已揭晓'), { statusCode: 400 });
  }
  const itemId = room.drawPool.shift()!;
  room.currentItemId = itemId;
  room.drawnItemIds.push(itemId);

  for (const player of room.players) {
    player.marked = applyDraw(player.board, player.marked, itemId);
    if (!room.winnerUserId && checkWin(player.marked)) {
      room.winnerUserId = player.userId;
      room.winnerUsername = player.username;
      room.status = 'finished';
    }
  }
  return room;
}

export function getRoom(code: string): BingoRoom | undefined {
  return findRoom(code);
}
