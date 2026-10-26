import {
  appendRecord,
  bindSocket,
  finishRoom,
  getRoom,
  resetRoom,
  sendJson,
  startRoom,
  unbindSocket,
  type PresenceSocket,
} from '@game-life/platform-server';
import type { Color } from '../colors.js';
import type { GameView, HanabiView } from '../view.js';
import type { GameState } from './engine.js';
import {
  discardCard,
  giveHint,
  playCard,
  startGame,
  viewGameForPlayer,
} from './engine.js';
import { hanabiMeta } from '../meta.js';

export type SocketLike = PresenceSocket;

export type HanabiAction =
  | { kind: 'hint'; targetPlayerId: string; hintType: 'color' | 'value'; value: Color | number }
  | { kind: 'discard'; cardId: string }
  | { kind: 'play'; cardId: string };

export interface SessionPlayer {
  userId: string;
  username: string;
  connected: boolean;
  sockets: Set<SocketLike>;
  lastSeenAt: number;
}

export interface HanabiSession {
  code: string;
  hostUserId: string;
  players: SessionPlayer[];
  game: GameState;
  historySaved: boolean;
}

const sessions = new Map<string, HanabiSession>();

export function beginSession(
  code: string,
  hostUserId: string,
  players: Array<{ userId: string; username: string }>,
): HanabiSession {
  const game = startGame(players.map((p) => ({ id: p.userId })));
  const session: HanabiSession = {
    code: code.toUpperCase(),
    hostUserId,
    players: players.map((p) => ({
      userId: p.userId,
      username: p.username,
      connected: true,
      sockets: new Set(),
      lastSeenAt: Date.now(),
    })),
    game,
    historySaved: false,
  };
  sessions.set(session.code, session);
  return session;
}

export function getSession(code: string): HanabiSession | undefined {
  return sessions.get(code.toUpperCase());
}

export function publicView(session: HanabiSession, viewerId: string): HanabiView {
  return {
    code: session.code,
    hostUserId: session.hostUserId,
    players: session.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      connected: p.connected,
    })),
    game: viewGameForPlayer(session.game, viewerId),
  };
}

function playerOf(session: HanabiSession, userId: string): SessionPlayer | undefined {
  return session.players.find((p) => p.userId === userId);
}

export function attachSocket(session: HanabiSession, userId: string, socket: SocketLike): void {
  const player = playerOf(session, userId);
  if (!player) return;
  bindSocket(player, socket);
}

export function detachSocket(session: HanabiSession, userId: string, socket: SocketLike): void {
  const player = playerOf(session, userId);
  if (!player) return;
  unbindSocket(player, socket);
}

export function broadcast(session: HanabiSession): void {
  for (const player of session.players) {
    if (player.sockets.size === 0) continue;
    const message = JSON.stringify({
      type: 'room:update',
      payload: publicView(session, player.userId),
    });
    for (const socket of player.sockets) {
      if (socket.readyState === 1) socket.send(message);
    }
  }
}

export function sendTo(socket: SocketLike, type: string, payload: unknown): void {
  sendJson(socket, type, payload);
}

async function saveHistory(session: HanabiSession): Promise<void> {
  if (session.historySaved || !session.game.result) return;
  session.historySaved = true;

  const playedAt = new Date().toISOString();
  const score = session.game.score ?? 0;
  await Promise.all(
    session.players.map((player) => {
      const opponents = session.players
        .filter((other) => other.userId !== player.userId)
        .map((other) => ({ userId: other.userId, username: other.username }));
      return appendRecord({
        userId: player.userId,
        gameId: hanabiMeta.id,
        rawScore: score,
        playedAt,
        meta: {
          kind: 'hanabi',
          roomCode: session.code,
          result: session.game.result,
          scoreLabel: session.game.scoreLabel ?? null,
          opponents,
        },
      });
    }),
  );

  try {
    finishRoom(session.code, session.hostUserId);
  } catch {
    // 房间可能已被房主结束，记录已写入即可
  }
}

/** 执行一次行动并把终局写回平台房间 */
export async function applyAction(
  code: string,
  userId: string,
  action: HanabiAction,
): Promise<HanabiSession> {
  const session = getSession(code);
  if (!session) throw Object.assign(new Error('对局未开始'), { statusCode: 400 });
  if (!playerOf(session, userId)) {
    throw Object.assign(new Error('你不在该房间'), { statusCode: 403 });
  }
  if (session.game.result) throw Object.assign(new Error('对局已结束'), { statusCode: 400 });

  const currentId = session.game.playerOrder[session.game.turnIndex];
  const current = session.players.find((p) => p.userId === currentId);
  if (current && !current.connected && current.userId !== userId) {
    throw Object.assign(
      new Error('当前行动玩家已断线，请等待其重连（不代打、不跳过）'),
      { statusCode: 409 },
    );
  }

  try {
    if (action.kind === 'hint') {
      giveHint(session.game, userId, {
        targetPlayerId: action.targetPlayerId,
        type: action.hintType,
        value: action.value,
      });
    } else if (action.kind === 'discard') {
      discardCard(session.game, userId, { cardId: action.cardId });
    } else {
      playCard(session.game, userId, { cardId: action.cardId });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败';
    throw Object.assign(new Error(message), { statusCode: 400 });
  }

  if (session.game.result) await saveHistory(session);
  return session;
}

/** 房主结算后再来一局：复用平台房间的 reset + start */
export async function restartSession(code: string, userId: string): Promise<HanabiSession> {
  const room = getRoom(code);
  if (!room) throw Object.assign(new Error('房间不存在'), { statusCode: 404 });
  if (room.hostUserId !== userId) {
    throw Object.assign(new Error('只有房主可以再来一局'), { statusCode: 403 });
  }
  if (room.status !== 'finished') {
    throw Object.assign(new Error('对局还没有结束'), { statusCode: 400 });
  }

  // 重开一局时组件不会卸载，WS 连接要接到新会话上
  const previous = getSession(code);
  const sockets = new Map<string, SocketLike[]>(
    previous?.players.map((p) => [p.userId, [...p.sockets]]) ?? [],
  );

  resetRoom(code, userId);
  try {
    await startRoom(code, userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '无法开始新一局';
    throw Object.assign(new Error(message), { statusCode: 400 });
  }

  const next = getSession(code)!;
  for (const [playerId, list] of sockets) {
    for (const socket of list) attachSocket(next, playerId, socket);
  }
  // 旧会话不再持有这些连接，避免它的广播把上一局状态推回客户端
  if (previous) {
    for (const player of previous.players) player.sockets.clear();
  }
  return next;
}
