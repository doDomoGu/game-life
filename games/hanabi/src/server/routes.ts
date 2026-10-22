import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { GameHttpApp } from '@game-life/shared';
import { authenticateToken, getRoom, requireAuth } from '@game-life/platform-server';
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
      void openSocket(socket as unknown as SocketLike, request);
    },
  );
}

async function openSocket(socket: SocketLike, request: FastifyRequest): Promise<void> {
  const query = request.query as { token?: string };
  const code = String((request.params as { code?: string }).code ?? '').toUpperCase();

  let user: { id: string };
  try {
    user = await authenticateToken(String(query.token ?? ''));
  } catch (err) {
    sessions.sendTo(socket, 'error', { message: errorOf(err).message });
    closeSocket(socket);
    return;
  }

  const room = getRoom(code);
  if (!room || room.gameId !== hanabiMeta.id) {
    sessions.sendTo(socket, 'error', { message: '房间不存在' });
    closeSocket(socket);
    return;
  }
  if (!room.players.some((p) => p.userId === user.id)) {
    sessions.sendTo(socket, 'error', { message: '你不在该房间' });
    closeSocket(socket);
    return;
  }
  const session = sessions.getSession(code);
  if (!session) {
    sessions.sendTo(socket, 'error', { message: '对局尚未开始' });
    closeSocket(socket);
    return;
  }

  const ws = socket as unknown as {
    on(event: 'message', cb: (raw: unknown) => void): void;
    on(event: 'close', cb: () => void): void;
  };

  sessions.attachSocket(session, user.id, socket);
  sessions.sendTo(socket, 'room:update', sessions.publicView(session, user.id));
  sessions.broadcast(session);

  ws.on('message', (raw) => {
    void onMessage(socket, session.code, user.id, raw);
  });
  ws.on('close', () => {
    const current = sessions.getSession(code);
    if (!current) return;
    sessions.detachSocket(current, user.id, socket);
    sessions.broadcast(current);
  });
}

async function onMessage(
  socket: SocketLike,
  code: string,
  userId: string,
  raw: unknown,
): Promise<void> {
  let message: WireMessage;
  try {
    message = JSON.parse(String(raw)) as WireMessage;
  } catch {
    sessions.sendTo(socket, 'error', { message: '无效消息' });
    return;
  }

  if (message.type === 'ping') {
    sessions.sendTo(socket, 'pong', { t: Date.now() });
    return;
  }

  try {
    const action = parseAction(message);
    const session = await sessions.applyAction(code, userId, action);
    sessions.broadcast(session);
  } catch (err) {
    sessions.sendTo(socket, 'error', { message: errorOf(err).message });
  }
}

function closeSocket(socket: SocketLike): void {
  const closable = socket as unknown as { close?: () => void };
  closable.close?.();
}
