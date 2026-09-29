import type { FastifyInstance } from 'fastify';
import { getServerGame } from '../games/registry.js';
import { requireAuth } from '../middleware/auth.js';
import type { PlatformRoom } from './store.js';
import * as rooms from './store.js';

export interface RoomView {
  code: string;
  status: PlatformRoom['status'];
  hostUserId: string;
  gameId: string | null;
  gameName: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  players: PlatformRoom['players'];
  playerCount: number;
}

function toView(room: PlatformRoom): RoomView {
  const game = room.gameId ? getServerGame(room.gameId) : undefined;
  return {
    code: room.code,
    status: room.status,
    hostUserId: room.hostUserId,
    gameId: room.gameId,
    gameName: game?.name ?? null,
    minPlayers: game?.minPlayers ?? null,
    maxPlayers: game?.maxPlayers ?? null,
    players: room.players,
    playerCount: room.players.length,
  };
}

function handleError(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  const statusCode =
    err && typeof err === 'object' && 'statusCode' in err && typeof err.statusCode === 'number'
      ? err.statusCode
      : 500;
  const message =
    err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
      ? err.message
      : '请求失败';
  return reply.code(statusCode).send({ message });
}

export async function roomRoutes(app: FastifyInstance) {
  app.get('/api/rooms', { preHandler: requireAuth }, async (request) => {
    const mine = rooms.currentRoomOf(request.user!.id);
    return {
      mine: mine ? toView(mine) : null,
      waiting: rooms.listWaitingRooms().map(toView),
    };
  });

  app.post('/api/rooms', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return toView(rooms.createRoom(request.user!.id, request.user!.username));
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.post<{ Params: { code: string } }>(
    '/api/rooms/:code/join',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return toView(rooms.joinRoom(request.params.code, request.user!.id, request.user!.username));
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.post('/api/rooms/leave', { preHandler: requireAuth }, async (request) => {
    rooms.leaveRoom(request.user!.id);
    return { ok: true };
  });

  app.get<{ Params: { code: string } }>(
    '/api/rooms/:code',
    { preHandler: requireAuth },
    async (request, reply) => {
      const room = rooms.getRoom(request.params.code);
      if (!room) return reply.code(404).send({ message: '房间不存在' });
      return toView(room);
    },
  );

  app.post<{ Params: { code: string }; Body: { gameId: string } }>(
    '/api/rooms/:code/game',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return toView(rooms.selectGame(request.params.code, request.user!.id, request.body.gameId));
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.post<{ Params: { code: string } }>(
    '/api/rooms/:code/start',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return toView(await rooms.startRoom(request.params.code, request.user!.id));
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.post<{ Params: { code: string } }>(
    '/api/rooms/:code/finish',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return toView(rooms.finishRoom(request.params.code, request.user!.id));
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.post<{ Params: { code: string } }>(
    '/api/rooms/:code/reset',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return toView(rooms.resetRoom(request.params.code, request.user!.id));
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
