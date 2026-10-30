import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gameCapacityLabel } from '@game-life/shared';
import { getServerGame } from '../games/registry.js';
import type { PresenceSocket } from '../realtime/presence.js';

export type RoomStatus = 'waiting' | 'playing' | 'finished';
export type PlayerRole = 'host' | 'guest';
export type VoteKind = 'end' | 'rematch';
export type VoteDecision = 'yes' | 'no';
export type EndReason = 'finished' | 'aborted';

export interface RoomVote {
  kind: VoteKind;
  initiatorId: string;
  createdAt: number;
  expiresAt: number;
  votes: Record<string, VoteDecision>;
}

export interface RoomSocket extends PresenceSocket {
  close?: () => void;
}

export interface RoomPlayer {
  userId: string;
  username: string;
  role: PlayerRole;
  ready: boolean;
  lastSeenAt: number;
  online: boolean;
  sockets: Set<RoomSocket>;
}

export interface PlatformRoom {
  code: string;
  hostUserId: string;
  status: RoomStatus;
  gameId: string | null;
  players: RoomPlayer[];
  createdAt: number;
  lastActiveAt: number;
  /** 每开始一局自增，客户端用它判断是否需要重挂载游戏组件 */
  roundId: number;
  vote: RoomVote | null;
  endReason: EndReason | null;
  finishedAt: number | null;
}

/** 由客户端轮询、房间实时通道和游戏内实时通道共同刷新 */
export const ONLINE_WINDOW_MS = durationFromEnv('GAME_LIFE_ONLINE_WINDOW_MS', 60_000);
export const VOTE_DURATION_MS = durationFromEnv('GAME_LIFE_VOTE_DURATION_MS', 30_000);
const WAITING_TTL_MS = 2 * 60 * 60 * 1000;
const FINISHED_TTL_MS = 10 * 60 * 1000;
const PRESENCE_TICK_MS = 10_000;
const SAVE_DEBOUNCE_MS = 400;

function durationFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const rooms = new Map<string, PlatformRoom>();
const userRoom = new Map<string, string>();
const updateListeners = new Set<(room: PlatformRoom) => void>();

let persistPath: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let presenceTimer: ReturnType<typeof setInterval> | null = null;

function fail(message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode });
}

function randomCode(): string {
  return randomBytes(3).toString('hex').toUpperCase();
}

function publish(room: PlatformRoom): void {
  for (const listener of updateListeners) {
    try {
      listener(room);
    } catch {
      // 单个订阅者失败不能影响房间状态
    }
  }
}

export function subscribeRoomUpdates(listener: (room: PlatformRoom) => void): () => void {
  updateListeners.add(listener);
  return () => updateListeners.delete(listener);
}

function touch(room: PlatformRoom): void {
  room.lastActiveAt = Date.now();
  publish(room);
  scheduleSave();
}

function resetReady(room: PlatformRoom): void {
  for (const player of room.players) {
    player.ready = player.role === 'host';
  }
}

function gameMaxPlayers(room: PlatformRoom): number {
  const game = room.gameId ? getServerGame(room.gameId) : undefined;
  return game?.maxPlayers ?? 8;
}

function gameSnapshot(room: PlatformRoom): unknown {
  if (!room.gameId) return null;
  const game = getServerGame(room.gameId);
  if (!game?.snapshotRoom) return null;
  try {
    return game.snapshotRoom({ code: room.code });
  } catch {
    return null;
  }
}

function abortGameSession(room: PlatformRoom): void {
  if (!room.gameId) return;
  try {
    getServerGame(room.gameId)?.onRoomAbort?.({ code: room.code });
  } catch {
    // 游戏清理失败不能阻塞房间状态迁移
  }
}

function detachUser(userId: string) {
  userRoom.delete(userId);
}

function bindUser(userId: string, code: string) {
  userRoom.set(userId, code);
}

function computeOnline(player: RoomPlayer, at = Date.now()): boolean {
  return player.sockets.size > 0 || (player.lastSeenAt > 0 && at - player.lastSeenAt <= ONLINE_WINDOW_MS);
}

function refreshOnline(room: PlatformRoom, force = false): void {
  let changed = false;
  for (const player of room.players) {
    const next = computeOnline(player);
    if (player.online !== next) {
      player.online = next;
      changed = true;
    }
  }
  if (changed || force) {
    if (room.vote) syncRoom(room);
    publish(room);
  }
}

function sendToPlayer(player: RoomPlayer, type: string, payload: unknown): void {
  const message = JSON.stringify({ type, payload });
  for (const socket of player.sockets) {
    try {
      if (socket.readyState === 1) socket.send(message);
    } catch {
      // 连接可能刚好断开
    }
  }
}

function closePlayerSockets(player: RoomPlayer): void {
  for (const socket of player.sockets) {
    try {
      socket.close?.();
    } catch {
      // 忽略关闭异常
    }
  }
  player.sockets.clear();
  player.online = false;
}

function markFinished(room: PlatformRoom, reason: EndReason): void {
  if (room.status === 'finished') return;
  room.status = 'finished';
  room.endReason = reason;
  room.finishedAt = Date.now();
  room.vote = null;
  resetReady(room);
  if (reason === 'aborted') abortGameSession(room);
  touch(room);
}

function isEligibleVoter(vote: RoomVote, player: RoomPlayer): boolean {
  if (player.userId === vote.initiatorId) return false;
  // 结束投票只等在线玩家，避免一个人掉线就把整房卡住；再来一局必须所有成员明确同意。
  return vote.kind === 'rematch' || isPlayerOnline(player);
}

function voteSatisfied(room: PlatformRoom, vote: RoomVote): boolean {
  return room.players
    .filter((player) => isEligibleVoter(vote, player))
    .every((player) => vote.votes[player.userId] === 'yes');
}

function scheduleVoteExpiry(room: PlatformRoom): void {
  const vote = room.vote;
  if (!vote) return;
  const delay = Math.max(0, vote.expiresAt - Date.now()) + 20;
  const timer = setTimeout(() => {
    const current = rooms.get(room.code);
    if (!current?.vote || current.vote.expiresAt > Date.now()) return;
    current.vote = null;
    touch(current);
  }, delay);
  timer.unref?.();
}

function syncRoom(room: PlatformRoom): void {
  const vote = room.vote;
  if (!vote) return;
  if (Date.now() >= vote.expiresAt) {
    room.vote = null;
    publish(room);
    scheduleSave();
    return;
  }
  if (vote.kind === 'end' && voteSatisfied(room, vote)) {
    markFinished(room, 'aborted');
  }
}

function dropRoom(room: PlatformRoom): void {
  for (const player of room.players) {
    sendToPlayer(player, 'room:closed', { message: '房间已关闭' });
    closePlayerSockets(player);
    detachUser(player.userId);
  }
  rooms.delete(room.code);
  abortGameSession(room);
  scheduleSave();
}

function sweepRooms(now = Date.now()): void {
  for (const room of [...rooms.values()]) {
    syncRoom(room);
    const since =
      room.status === 'finished' ? (room.finishedAt ?? room.lastActiveAt) : room.lastActiveAt;
    const ttl =
      room.status === 'waiting'
        ? WAITING_TTL_MS
        : room.status === 'finished'
          ? FINISHED_TTL_MS
          : Number.POSITIVE_INFINITY;
    if (now - since > ttl) dropRoom(room);
  }
}

export function isPlayerOnline(player: RoomPlayer, at = Date.now()): boolean {
  return computeOnline(player, at);
}

export function getRoom(code: string): PlatformRoom | undefined {
  const room = rooms.get(code.toUpperCase());
  if (!room) return undefined;
  syncRoom(room);
  return room;
}

export function listWaitingRooms(): PlatformRoom[] {
  sweepRooms();
  return [...rooms.values()].filter((room) => room.status === 'waiting');
}

export function markSeen(userId: string): void {
  const code = userRoom.get(userId);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) {
    detachUser(userId);
    return;
  }
  const player = room.players.find((p) => p.userId === userId);
  if (!player) return;
  player.lastSeenAt = Date.now();
  refreshOnline(room);
}

export function attachRoomSocket(
  code: string,
  userId: string,
  socket: RoomSocket,
): PlatformRoom | undefined {
  const room = getRoom(code);
  const player = room?.players.find((p) => p.userId === userId);
  if (!room || !player) return undefined;
  player.sockets.add(socket);
  player.lastSeenAt = Date.now();
  refreshOnline(room, true);
  return room;
}

export function detachRoomSocket(code: string, userId: string, socket: RoomSocket): void {
  const room = rooms.get(code.toUpperCase());
  const player = room?.players.find((p) => p.userId === userId);
  if (!room || !player) return;
  player.sockets.delete(socket);
  if (player.sockets.size === 0) player.lastSeenAt = 0;
  refreshOnline(room, true);
}

export function leaveRoom(userId: string): void {
  const code = userRoom.get(userId);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) {
    detachUser(userId);
    return;
  }
  if (room.status === 'playing' && gameMaxPlayers(room) > 1 && room.players.length > 1) {
    fail('对局进行中，请先发起结束投票', 409);
  }
  const leaving = room.players.find((p) => p.userId === userId);
  if (leaving) {
    closePlayerSockets(leaving);
    detachUser(userId);
  }
  room.players = room.players.filter((p) => p.userId !== userId);
  room.vote = null;
  if (room.players.length === 0) {
    dropRoom(room);
    return;
  }
  if (room.hostUserId === userId) {
    const next = room.players[0];
    if (!next) return;
    room.hostUserId = next.userId;
    for (const player of room.players) {
      player.role = player.userId === next.userId ? 'host' : 'guest';
    }
  }
  resetReady(room);
  touch(room);
}

export function kickPlayer(code: string, hostUserId: string, targetUserId: string): PlatformRoom {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  if (room.hostUserId !== hostUserId) fail('仅房主可以移出玩家', 403);
  if (room.status !== 'waiting') fail('只有等待中的房间可以移出玩家', 400);
  const target = room.players.find((p) => p.userId === targetUserId);
  if (!target) fail('该玩家不在房间里', 404);
  if (target.role === 'host') fail('不能移出房主', 400);
  sendToPlayer(target, 'room:kicked', { message: '你已被房主移出房间' });
  closePlayerSockets(target);
  detachUser(target.userId);
  room.players = room.players.filter((p) => p.userId !== target.userId);
  room.vote = null;
  resetReady(room);
  touch(room);
  return room;
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
  const now = Date.now();
  const room: PlatformRoom = {
    code,
    hostUserId: userId,
    status: 'waiting',
    gameId: null,
    players: [
      {
        userId,
        username,
        role: 'host',
        ready: true,
        lastSeenAt: now,
        online: true,
        sockets: new Set(),
      },
    ],
    createdAt: now,
    lastActiveAt: now,
    roundId: 0,
    vote: null,
    endReason: null,
    finishedAt: null,
  };
  rooms.set(code, room);
  bindUser(userId, code);
  publish(room);
  scheduleSave();
  return room;
}

export function joinRoom(code: string, userId: string, username: string): PlatformRoom {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  if (room.players.some((p) => p.userId === userId)) {
    markSeen(userId);
    return room;
  }
  if (room.status !== 'waiting') {
    fail(room.status === 'playing' ? '对局进行中，无法加入' : '对局已结束，无法加入', 400);
  }
  const game = room.gameId ? getServerGame(room.gameId) : undefined;
  const cap = game?.maxPlayers ?? 8;
  if (room.players.length >= cap) {
    const full =
      game && game.minPlayers === game.maxPlayers
        ? gameCapacityLabel(game.minPlayers, game.maxPlayers)
        : `最多 ${cap} 人`;
    fail(`房间已满（${full}）`, 400);
  }
  releaseIfIdle(userId);
  const fresh = getRoom(code);
  if (!fresh) fail('房间不存在', 404);
  if (fresh.players.some((p) => p.userId === userId)) return fresh;
  if (fresh.status !== 'waiting') fail('房间状态已变化，请稍后重试', 409);
  fresh.players.push({
    userId,
    username,
    role: 'guest',
    ready: false,
    lastSeenAt: Date.now(),
    online: true,
    sockets: new Set(),
  });
  resetReady(fresh);
  touch(fresh);
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
    const limit =
      game.minPlayers === game.maxPlayers
        ? `是${gameCapacityLabel(game.minPlayers, game.maxPlayers)}`
        : `最多 ${game.maxPlayers} 人`;
    fail(`当前 ${room.players.length} 人，「${game.name}」${limit}`, 400);
  }
  room.gameId = gameId;
  resetReady(room);
  touch(room);
  return room;
}

export function setReady(code: string, userId: string, ready: boolean): PlatformRoom {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  const player = room.players.find((p) => p.userId === userId);
  if (!player) fail('你不在该房间', 403);
  if (room.status !== 'waiting') fail('对局已开始，无法修改准备状态', 400);
  if (player.role === 'host') fail('房主默认准备，无需切换', 400);
  player.ready = ready === true;
  touch(room);
  return room;
}

export interface StartRoomOptions {
  /** 再来一局投票已经征得全员同意，跳过准备校验 */
  skipReadyCheck?: boolean;
}

export async function startRoom(
  code: string,
  hostUserId: string,
  options: StartRoomOptions = {},
): Promise<PlatformRoom> {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  if (room.hostUserId !== hostUserId) fail('仅房主可以开始', 403);
  if (room.status !== 'waiting') fail('当前不能开始', 400);
  if (!room.gameId) fail('请先选择游戏', 400);
  const game = getServerGame(room.gameId);
  if (!game) fail('游戏不存在', 404);
  if (room.players.length < game.minPlayers || room.players.length > game.maxPlayers) {
    const limit =
      game.minPlayers === game.maxPlayers
        ? `是${gameCapacityLabel(game.minPlayers, game.maxPlayers)}`
        : room.players.length < game.minPlayers
          ? `至少需要 ${game.minPlayers} 人`
          : `最多 ${game.maxPlayers} 人`;
    fail(`「${game.name}」${limit}，当前 ${room.players.length} 人`, 400);
  }
  if (!options.skipReadyCheck) {
    const notReady = room.players.filter((p) => p.role === 'guest' && !p.ready);
    if (notReady.length > 0) {
      fail(`还有 ${notReady.map((p) => p.username).join('、')} 没有准备`, 400);
    }
  }
  if (game.onStart) {
    await game.onStart({
      code: room.code,
      hostUserId: room.hostUserId,
      players: room.players.map((p) => ({
        userId: p.userId,
        username: p.username,
        role: p.role,
      })),
    });
  }
  room.status = 'playing';
  room.roundId += 1;
  room.vote = null;
  room.endReason = null;
  room.finishedAt = null;
  resetReady(room);
  touch(room);
  return room;
}

export function finishRoom(code: string, userId: string): PlatformRoom {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  if (!room.players.some((p) => p.userId === userId)) fail('你不在该房间', 403);
  if (room.status === 'finished') return room;
  if (room.status !== 'playing') fail('没有进行中的对局', 400);
  markFinished(room, 'finished');
  return room;
}

/** 游戏服务端判定一局正常结束时调用；房间状态只由平台修改。 */
export function reportGameOver(code: string, userId: string): PlatformRoom {
  return finishRoom(code, userId);
}

export function backToWaiting(code: string, userId: string): PlatformRoom {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  if (room.hostUserId !== userId) fail('仅房主可以返回等待房', 403);
  if (room.status !== 'finished') fail('本局尚未结束', 400);
  room.vote = null;
  room.status = 'waiting';
  room.endReason = null;
  room.finishedAt = null;
  resetReady(room);
  abortGameSession(room);
  touch(room);
  return room;
}

export function beginEndVote(code: string, userId: string): PlatformRoom {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  if (!room.players.some((p) => p.userId === userId)) fail('你不在该房间', 403);
  if (room.status !== 'playing') fail('没有进行中的对局', 400);
  if (room.players.length <= 1) fail('单人游戏可以直接退出', 400);
  if (room.vote) fail('已有投票进行中', 409);
  const now = Date.now();
  room.vote = {
    kind: 'end',
    initiatorId: userId,
    createdAt: now,
    expiresAt: now + VOTE_DURATION_MS,
    votes: { [userId]: 'yes' },
  };
  scheduleVoteExpiry(room);
  touch(room);
  syncRoom(room);
  return room;
}

export interface VoteStartResult {
  room: PlatformRoom;
  passed: boolean;
}

export function beginRematchVote(code: string, userId: string): VoteStartResult {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  if (room.hostUserId !== userId) fail('仅房主可以发起再来一局', 403);
  if (room.status !== 'finished') fail('本局尚未结束', 400);
  if (room.vote) fail('已有投票进行中', 409);
  const now = Date.now();
  room.vote = {
    kind: 'rematch',
    initiatorId: userId,
    createdAt: now,
    expiresAt: now + VOTE_DURATION_MS,
    votes: { [userId]: 'yes' },
  };
  scheduleVoteExpiry(room);
  touch(room);
  return { room, passed: voteSatisfied(room, room.vote) };
}

export interface VoteResult {
  room: PlatformRoom;
  kind: VoteKind;
  passed: boolean;
  cancelled: boolean;
}

export function castVote(code: string, userId: string, decision: VoteDecision): VoteResult {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  const vote = room.vote;
  if (!vote) fail('没有进行中的投票', 404);
  const player = room.players.find((p) => p.userId === userId);
  if (!player) fail('你不在该房间', 403);
  if (player.userId === vote.initiatorId) fail('发起人无需投票', 400);
  if (!isEligibleVoter(vote, player)) fail('你不需要参与这次投票', 403);
  if (vote.kind === 'end' && room.status !== 'playing') fail('对局已结束', 400);
  if (vote.kind === 'rematch' && room.status !== 'finished') fail('本局尚未结束', 400);

  const now = Date.now();
  if (now >= vote.expiresAt) {
    room.vote = null;
    touch(room);
    fail('投票已超时', 409);
  }

  if (decision !== 'yes') {
    room.vote = null;
    touch(room);
    return { room, kind: vote.kind, passed: false, cancelled: true };
  }
  vote.votes[userId] = 'yes';
  if (voteSatisfied(room, vote)) {
    if (vote.kind === 'end') {
      markFinished(room, 'aborted');
      return { room, kind: 'end', passed: true, cancelled: false };
    }
    room.vote = null;
    touch(room);
    return { room, kind: 'rematch', passed: true, cancelled: false };
  }
  touch(room);
  return { room, kind: vote.kind, passed: false, cancelled: false };
}

export function cancelVote(code: string, userId: string): PlatformRoom {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  if (!room.vote) fail('没有进行中的投票', 404);
  if (room.vote.initiatorId !== userId) fail('只有发起人可以撤回', 403);
  room.vote = null;
  touch(room);
  return room;
}

/** 再来一局投票通过后由平台直接开新一局，返回等待房对客户端与游戏组件都不可见 */
export async function applyRematch(code: string): Promise<PlatformRoom> {
  const room = getRoom(code);
  if (!room) fail('房间不存在', 404);
  if (room.status !== 'finished') fail('本局尚未结束', 400);
  if (!room.gameId) fail('请先选择游戏', 400);
  room.status = 'waiting';
  room.vote = null;
  resetReady(room);
  try {
    return await startRoom(code, room.hostUserId, { skipReadyCheck: true });
  } catch (err) {
    const current = rooms.get(room.code);
    if (current) {
      current.status = 'finished';
      current.finishedAt = Date.now();
      abortGameSession(current);
      touch(current);
    }
    throw err;
  }
}

export function currentRoomOf(userId: string): PlatformRoom | undefined {
  sweepRooms();
  const code = userRoom.get(userId);
  if (!code) return undefined;
  const room = rooms.get(code);
  if (!room) {
    detachUser(userId);
    return undefined;
  }
  return room;
}

/* ------------------------------------------------------------------ */
/* 持久化：房间与游戏会话快照写到 dataDir/rooms.json，重启后恢复         */
/* ------------------------------------------------------------------ */

interface PersistedPlayer {
  userId: string;
  username: string;
  role: PlayerRole;
  ready: boolean;
}

interface PersistedRoom {
  code: string;
  hostUserId: string;
  status: RoomStatus;
  gameId: string | null;
  players: PersistedPlayer[];
  createdAt: number;
  lastActiveAt: number;
  roundId: number;
  endReason: EndReason | null;
  finishedAt: number | null;
}

interface PersistedPayload {
  version: 1;
  savedAt: number;
  rooms: PersistedRoom[];
  sessions: Record<string, Record<string, unknown>>;
}

function serializeRoom(room: PlatformRoom): PersistedRoom {
  return {
    code: room.code,
    hostUserId: room.hostUserId,
    status: room.status,
    gameId: room.gameId,
    players: room.players.map((player) => ({
      userId: player.userId,
      username: player.username,
      role: player.role,
      ready: player.ready,
    })),
    createdAt: room.createdAt,
    lastActiveAt: room.lastActiveAt,
    roundId: room.roundId,
    endReason: room.endReason,
    finishedAt: room.finishedAt,
  };
}

export function flushRooms(): void {
  if (!persistPath) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const sessions: Record<string, Record<string, unknown>> = {};
  for (const room of rooms.values()) {
    if (!room.gameId) continue;
    const snapshot = gameSnapshot(room);
    if (snapshot == null) continue;
    (sessions[room.gameId] ??= {})[room.code] = snapshot;
  }
  const payload: PersistedPayload = {
    version: 1,
    savedAt: Date.now(),
    rooms: [...rooms.values()].map(serializeRoom),
    sessions,
  };
  try {
    mkdirSync(path.dirname(persistPath), { recursive: true });
    const tmp = `${persistPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload), { mode: 0o600 });
    renameSync(tmp, persistPath);
  } catch (err) {
    console.warn('[rooms] 保存房间状态失败', err);
  }
}

export function scheduleSave(): void {
  if (!persistPath || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushRooms();
  }, SAVE_DEBOUNCE_MS);
  saveTimer.unref?.();
}

/** 游戏会话发生变化的游戏包调用它，把最新状态纳入下一次落盘 */
export function markRoomsDirty(): void {
  scheduleSave();
}

function restoreRoom(raw: PersistedRoom, snapshot: unknown): PlatformRoom {
  const room: PlatformRoom = {
    code: String(raw.code).toUpperCase(),
    hostUserId: String(raw.hostUserId),
    status: raw.status,
    gameId: raw.gameId ?? null,
    players: raw.players.map((player) => ({
      userId: player.userId,
      username: player.username,
      role: player.role === 'host' ? 'host' : 'guest',
      ready: player.role === 'host' ? true : player.ready === true,
      lastSeenAt: 0,
      online: false,
      sockets: new Set(),
    })),
    createdAt: Number(raw.createdAt) || Date.now(),
    lastActiveAt: Number(raw.lastActiveAt) || Date.now(),
    roundId: Number(raw.roundId) || 0,
    vote: null,
    endReason: raw.endReason === 'aborted' ? 'aborted' : raw.endReason === 'finished' ? 'finished' : null,
    finishedAt: typeof raw.finishedAt === 'number' ? raw.finishedAt : null,
  };

  const game = room.gameId ? getServerGame(room.gameId) : undefined;
  if (!game) {
    if (room.status === 'playing') {
      room.status = 'finished';
      room.endReason = 'aborted';
      room.finishedAt = Date.now();
    }
    return room;
  }
  if (game.restoreRoom) {
    if (snapshot != null) {
      try {
        game.restoreRoom({ code: room.code, snapshot });
      } catch (err) {
        console.warn(`[rooms] 恢复 ${room.gameId} 牌局 ${room.code} 失败`, err);
        if (room.status === 'playing') {
          room.status = 'finished';
          room.endReason = 'aborted';
          room.finishedAt = Date.now();
        }
      }
    } else if (room.status === 'playing') {
      // 会话快照缺失，不能把玩家留在无法继续的对局里
      room.status = 'finished';
      room.endReason = 'aborted';
      room.finishedAt = Date.now();
    }
  }
  return room;
}

function loadRooms(): void {
  if (!persistPath || !existsSync(persistPath)) return;
  try {
    const payload = JSON.parse(readFileSync(persistPath, 'utf8')) as PersistedPayload;
    if (!payload || payload.version !== 1 || !Array.isArray(payload.rooms)) return;
    for (const raw of payload.rooms) {
      if (!raw || typeof raw.code !== 'string' || !Array.isArray(raw.players)) continue;
      const snapshot = raw.gameId ? payload.sessions?.[raw.gameId]?.[raw.code] : undefined;
      const room = restoreRoom(raw, snapshot);
      if (rooms.has(room.code)) continue;
      rooms.set(room.code, room);
      for (const player of room.players) bindUser(player.userId, room.code);
    }
  } catch (err) {
    console.warn('[rooms] 读取房间状态失败，忽略旧文件', err);
  }
}

export function initRoomStore(dataDir: string): void {
  if (persistPath) return;
  persistPath = path.join(dataDir, 'rooms.json');
  loadRooms();
  presenceTimer = setInterval(() => {
    for (const room of rooms.values()) {
      syncRoom(room);
      refreshOnline(room);
    }
  }, PRESENCE_TICK_MS);
  presenceTimer.unref?.();
}

export function shutdownRoomStore(): void {
  if (presenceTimer) clearInterval(presenceTimer);
  presenceTimer = null;
  flushRooms();
  persistPath = null;
}
