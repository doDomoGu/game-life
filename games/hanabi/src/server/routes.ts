import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { GameHttpApp } from '@game-life/shared';
import { acceptPlayerSocket, getRoom, requireAuth, type RealtimeSocket } from '@game-life/platform-server';
import { hanabiMeta } from '../meta.js';
import type { Color } from '../colors.js';
import type { HanabiAction, SocketLike } from './rooms.js';
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
function parseAction(message: WireMessage): HanabiAction {
  const payload = message.payload ?? {};
  if (message.type === 'action:hint') {
    const hintType = payload.hintType === 'value' ? 'value' : 'color';
    return {
      kind: 'hint',
      targetPlayerId: String(payload.targetPlayerId ?? ''),
      hintType,
      value: payload.value as Color | number,
    };
  }
  if (message.type === 'action:discard') {
    return { kind: 'discard', cardId: String(payload.cardId ?? '') };
  }
  if (message.type === 'action:play') {
    return { kind: 'play', cardId: String(payload.cardId ?? '') };
  }
  throw Object.assign(new Error('未知操作'), { statusCode: 400 });
}

export async function registerHanabiRoutes(app: GameHttpApp) {
  const fastify = app as unknown as FastifyInstance;

  fastify.get<{ Params: { code: string } }>(
    '/api/games/hanabi/rooms/:code',
    { preHandler: requireAuth },
    async (request, reply) => {
      const room = getRoom(request.params.code);
      if (!room || room.gameId !== hanabiMeta.id) {
        return reply.code(404).send({ message: '房间不存在' });
      }
      if (!room.players.some((p) => p.userId === request.user!.id)) {
        return reply.code(403).send({ message: '你不在该房间' });
      }
      const session = sessions.getSession(request.params.code);
      if (!session) return reply.code(404).send({ message: '对局尚未开始' });
      return sessions.publicView(session, request.user!.id);
    },
  );

  fastify.post<{ Params: { code: string }; Body: WireMessage }>(
    '/api/games/hanabi/rooms/:code/action',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const action = parseAction(request.body ?? {});
        const session = await sessions.applyAction(request.params.code, request.user!.id, action);
        sessions.broadcast(session);
        return sessions.publicView(session, request.user!.id);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  fastify.post<{ Params: { code: string } }>(
    '/api/games/hanabi/rooms/:code/restart',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const session = await sessions.restartSession(request.params.code, request.user!.id);
        sessions.broadcast(session);
        return sessions.publicView(session, request.user!.id);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  fastify.get<{ Params: { code: string }; Querystring: { token?: string } }>(
    '/api/games/hanabi/rooms/:code/ws',
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
    gameId: hanabiMeta.id,
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
