import {
  appendRecord,
  finishRoom,
  sendJson,
  type PresenceSocket,
} from '@game-life/platform-server';
import { mahjongWindMeta } from '../meta.js';
import { windOf, type MahjongWindView, type SettleKind } from '../view.js';
import {
  backToLastHand,
  cancelRiichi,
  cancelSettle,
  declareRiichi,
  endMatch,
  startGame,
  startNextHand,
  startSettle,
  submitSettle,
  undoHand,
  viewGame,
  type GameState,
} from './engine.js';

export type SocketLike = PresenceSocket;

export type WindAction =
  | { kind: 'riichi' }
  | { kind: 'cancelRiichi' }
  | { kind: 'startSettle'; settleKind: SettleKind; dealerFlag: boolean }
  | { kind: 'cancelSettle' }
  | { kind: 'submitSettle'; value: number }
  | { kind: 'nextHand' }
  | { kind: 'endMatch' }
  | { kind: 'undoHand' }
  | { kind: 'backHand' };

export interface SessionPlayer {
  userId: string;
  username: string;
  connected: boolean;
  sockets: Set<SocketLike>;
  lastSeenAt: number;
}

export interface WindSession {
  code: string;
  hostUserId: string;
  players: SessionPlayer[];
  game: GameState;
  startedAt: number;
  historySaved: boolean;
}

const sessions = new Map<string, WindSession>();

function fail(message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode });
}

export function beginSession(
  code: string,
  hostUserId: string,
  players: Array<{ userId: string; username: string }>,
): WindSession {
  const session: WindSession = {
    code: code.toUpperCase(),
    hostUserId,
    players: players.map((p) => ({
      userId: p.userId,
      username: p.username,
      connected: true,
      sockets: new Set(),
      lastSeenAt: Date.now(),
    })),
    game: startGame(players.map((p) => p.userId)),
    startedAt: Date.now(),
    historySaved: false,
  };
  sessions.set(session.code, session);
  return session;
}

export function getSession(code: string): WindSession | undefined {
  return sessions.get(code.toUpperCase());
}

export function publicView(session: WindSession): MahjongWindView {
  return {
    code: session.code,
    hostUserId: session.hostUserId,
    players: session.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      connected: p.connected,
    })),
    game: viewGame(session.game),
  };
}

function playerOf(session: WindSession, userId: string): SessionPlayer | undefined {
  return session.players.find((p) => p.userId === userId);
}

/** 四家看到的内容相同，只序列化一次 */
export function broadcast(session: WindSession): void {
  const message = JSON.stringify({ type: 'room:update', payload: publicView(session) });
  for (const player of session.players) {
    for (const socket of player.sockets) {
      if (socket.readyState === 1) socket.send(message);
    }
  }
}

export function sendTo(socket: SocketLike, type: string, payload: unknown): void {
  sendJson(socket, type, payload);
}

async function saveHistory(session: WindSession): Promise<void> {
  const results = session.game.results;
  if (session.historySaved || !results) return;
  session.historySaved = true;

  const playedAt = new Date().toISOString();
  const durationMs = Date.now() - session.startedAt;
  await Promise.all(
    results.map((row) => {
      const opponents = session.players
        .filter((other) => other.userId !== row.id)
        .map((other) => ({ userId: other.userId, username: other.username }));
      return appendRecord({
        userId: row.id,
        gameId: mahjongWindMeta.id,
        rawScore: row.score,
        durationMs,
        playedAt,
        meta: {
          kind: 'mahjong-wind',
          roomCode: session.code,
          won: row.rank === 1,
          rank: row.rank,
          pt: row.pt,
          uma: row.uma,
          seatWind: windOf(session.game.seats, row.id),
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

export async function applyAction(code: string, userId: string, action: WindAction): Promise<WindSession> {
  const session = getSession(code);
  if (!session) fail('对局未开始', 400);
  if (!playerOf(session, userId)) fail('你不在该房间', 403);
  if (session.game.phase === 'finished') fail('对局已结束', 400);

  let finished = false;
  try {
    const game = session.game;
    switch (action.kind) {
      case 'riichi':
        declareRiichi(game, userId);
        break;
      case 'cancelRiichi':
        cancelRiichi(game, userId);
        break;
      case 'startSettle':
        startSettle(game, action.settleKind, action.dealerFlag);
        break;
      case 'cancelSettle':
        cancelSettle(game);
        break;
      case 'submitSettle':
        submitSettle(game, userId, action.value);
        break;
      case 'nextHand':
        startNextHand(game);
        break;
      case 'endMatch':
        endMatch(game);
        finished = true;
        break;
      case 'undoHand':
        undoHand(game);
        break;
      case 'backHand':
        backToLastHand(game);
        break;
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : '操作失败', 400);
  }

  if (finished) await saveHistory(session);
  return session;
}
