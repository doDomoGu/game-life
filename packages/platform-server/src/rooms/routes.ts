import type { FastifyInstance } from 'fastify';
import { getServerGame } from '../games/registry.js';
import { requireAuth } from '../middleware/auth.js';
import type { VoteDecision } from './store.js';
import * as rooms from './store.js';
import { toView } from './view.js';

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
    rooms.markSeen(request.user!.id);
    const mine = rooms.currentRoomOf(request.user!.id);
    return {
      mine: mine ? toView(mine) : null,
      waiting: rooms.listWaitingRooms().map(toView),
    };
  });

  app.post('/api/rooms', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const room = rooms.createRoom(request.user!.id, request.user!.username);
      rooms.markSeen(request.user!.id);
      return toView(room);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.post<{ Params: { code: string } }>(
    '/api/rooms/:code/join',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const room = rooms.joinRoom(request.params.code, request.user!.id, request.user!.username);
        return toView(room);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.post('/api/rooms/leave', { preHandler: requireAuth }, async (request, reply) => {
    try {
      rooms.leaveRoom(request.user!.id);
      return { ok: true };
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.get<{ Params: { code: string } }>(
    '/api/rooms/:code',
    { preHandler: requireAuth },
    async (request, reply) => {
      const room = rooms.getRoom(request.params.code);
      if (!room) return reply.code(404).send({ message: '房间不存在' });
      if (!room.players.some((p) => p.userId === request.user!.id)) {
        return reply.code(403).send({ message: '你不在该房间' });
      }
      rooms.markSeen(request.user!.id);
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

  app.post<{ Params: { code: string }; Body: { ready?: boolean } }>(
    '/api/rooms/:code/ready',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return toView(
          rooms.setReady(request.params.code, request.user!.id, request.body?.ready === true),
        );
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
        const room = rooms.getRoom(request.params.code);
        if (!room) return reply.code(404).send({ message: '房间不存在' });
        const game = room.gameId ? getServerGame(room.gameId) : undefined;
        if (!game || game.maxPlayers > 1) {
          return reply.code(403).send({ message: '多人对局由游戏服务端结算' });
        }
        return toView(rooms.finishRoom(request.params.code, request.user!.id));
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.post<{ Params: { code: string }; Body: { userId?: string } }>(
    '/api/rooms/:code/kick',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return toView(
          rooms.kickPlayer(request.params.code, request.user!.id, String(request.body?.userId ?? '')),
        );
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.post<{ Params: { code: string } }>(
    '/api/rooms/:code/back-to-waiting',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return toView(rooms.backToWaiting(request.params.code, request.user!.id));
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.post<{ Params: { code: string } }>(
    '/api/rooms/:code/end-vote',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return toView(rooms.beginEndVote(request.params.code, request.user!.id));
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.post<{ Params: { code: string } }>(
    '/api/rooms/:code/rematch-vote',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const { room, passed } = rooms.beginRematchVote(request.params.code, request.user!.id);
        if (passed) {
          return toView(await rooms.applyRematch(request.params.code));
        }
        return toView(room);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.post<{ Params: { code: string }; Body: { decision?: string } }>(
    '/api/rooms/:code/vote',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const decision: VoteDecision = request.body?.decision === 'no' ? 'no' : 'yes';
        const result = rooms.castVote(request.params.code, request.user!.id, decision);
        if (result.passed && result.kind === 'rematch') {
          return toView(await rooms.applyRematch(request.params.code));
        }
        return toView(result.room);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.delete<{ Params: { code: string } }>(
    '/api/rooms/:code/vote',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return toView(rooms.cancelVote(request.params.code, request.user!.id));
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
