import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { GameHttpApp } from '@game-life/shared';
import { acceptPlayerSocket, getRoom, requireAuth, type RealtimeSocket } from '@game-life/platform-server';
import { mahjongWindMeta } from '../meta.js';
import type { SocketLike, WindAction } from './rooms.js';
import * as sessions from './rooms.js';

interface WireMessage {
  type?: string;
  payload?: Record<string, unknown>;
}

function errorOf(err: unknown): { statusCode: number; message: string } {
  const statusCode =
    err && typeof err === 'object' && 'statusCode' in err && typeof err.statusCode === 'number'
      ? err.statusCode
      : 500;
  const message =
    err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
      ? err.message
      : '请求失败';
  return { statusCode, message };
}

function handleError(reply: FastifyReply, err: unknown) {
  const { statusCode, message } = errorOf(err);
  return reply.code(statusCode).send({ message });
}

/** WS 与 HTTP 共用同一套消息格式 */
function parseAction(message: WireMessage): WindAction {
  const payload = message.payload ?? {};
  switch (message.type) {
    case 'action:riichi':
      return { kind: 'riichi' };
    case 'action:cancel-riichi':
      return { kind: 'cancelRiichi' };
    case 'action:settle-start':
      return {
        kind: 'startSettle',
        settleKind: payload.kind === 'draw' ? 'draw' : 'win',
        dealerFlag: payload.dealerFlag === true,
      };
    case 'action:settle-cancel':
      return { kind: 'cancelSettle' };
    case 'action:settle-submit':
      return { kind: 'submitSettle', value: Number(payload.value) };
    case 'action:next-hand':
      return { kind: 'nextHand' };
    case 'action:end-match':
      return { kind: 'endMatch' };
    case 'action:undo-hand':
      return { kind: 'undoHand' };
    case 'action:back-hand':
      return { kind: 'backHand' };
    default:
      throw Object.assign(new Error('未知操作'), { statusCode: 400 });
  }
}

const base = `/api/games/${mahjongWindMeta.id}/rooms/:code`;

export async function registerMahjongWindRoutes(app: GameHttpApp) {
  const fastify = app as unknown as FastifyInstance;

  fastify.get<{ Params: { code: string } }>(base, { preHandler: requireAuth }, async (request, reply) => {
    const room = getRoom(request.params.code);
    if (!room || room.gameId !== mahjongWindMeta.id) {
      return reply.code(404).send({ message: '房间不存在' });
    }
    if (!room.players.some((p) => p.userId === request.user!.id)) {
      return reply.code(403).send({ message: '你不在该房间' });
    }
    const session = sessions.getSession(request.params.code);
    if (!session) return reply.code(404).send({ message: '对局尚未开始' });
    return sessions.publicView(session);
  });

  fastify.post<{ Params: { code: string }; Body: WireMessage }>(
    `${base}/action`,
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const action = parseAction(request.body ?? {});
        const session = await sessions.applyAction(request.params.code, request.user!.id, action);
        sessions.broadcast(session);
        return sessions.publicView(session);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  fastify.get<{ Params: { code: string }; Querystring: { token?: string } }>(
    `${base}/ws`,
    { websocket: true },
    (socket, request) => {
      void openSocket(socket as unknown as RealtimeSocket, request);
    },
  );
}

async function openSocket(socket: RealtimeSocket, request: FastifyRequest): Promise<void> {
  const query = request.query as { token?: string };
  const code = String((request.params as { code?: string }).code ?? '').toUpperCase();

  await acceptPlayerSocket({
    socket,
    token: String(query.token ?? ''),
    code,
    gameId: mahjongWindMeta.id,
    findMember: (roomCode, userId) => sessions.getSession(roomCode)?.players.find((p) => p.userId === userId),
    onChange: (roomCode) => {
      const current = sessions.getSession(roomCode);
      if (current) sessions.broadcast(current);
    },
    onMessage: (userId, message) => onMessage(socket, code, userId, message),
  });
}

async function onMessage(
  socket: SocketLike,
  code: string,
  userId: string,
  message: { type?: string; payload?: unknown },
): Promise<void> {
  try {
    const action = parseAction({
      type: message.type,
      payload:
        message.payload && typeof message.payload === 'object'
          ? (message.payload as Record<string, unknown>)
          : {},
    });
    const session = await sessions.applyAction(code, userId, action);
    sessions.broadcast(session);
  } catch (err) {
    sessions.sendTo(socket, 'error', { message: errorOf(err).message });
  }
}
