import type { FastifyInstance } from 'fastify';
import type { GameHttpApp } from '@game-life/shared';
import { BINGO_ITEM_LABELS } from '../items.js';
import type { BingoRoom, RoomPlayer } from './rooms.js';
import * as rooms from './rooms.js';
import { requireAuth } from '@game-life/platform-server';

export interface BingoRoomView {
  code: string;
  status: BingoRoom['status'];
  hostUserId: string;
  players: Array<{
    userId: string;
    username: string;
    role: RoomPlayer['role'];
  }>;
  drawnItemIds: number[];
  currentItemId: number | null;
  itemLabels: readonly string[];
  winner: { userId: string; username: string } | null;
  myBoard: number[] | null;
  myMarked: boolean[] | null;
}

function toView(room: BingoRoom, viewerUserId: string): BingoRoomView {
  const me = room.players.find((p) => p.userId === viewerUserId);
  return {
    code: room.code,
    status: room.status,
    hostUserId: room.hostUserId,
    players: room.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      role: p.role,
    })),
    drawnItemIds: room.drawnItemIds,
    currentItemId: room.currentItemId,
    itemLabels: BINGO_ITEM_LABELS,
    winner: room.winnerUserId
      ? { userId: room.winnerUserId, username: room.winnerUsername ?? '' }
      : null,
    myBoard: me?.board ?? null,
    myMarked: me?.marked ?? null,
  };
}

function handleError(reply: import('fastify').FastifyReply, err: unknown) {
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

export async function registerBingoRoutes(app: GameHttpApp) {
  const fastify = app as FastifyInstance;
  fastify.post('/api/games/bingo/rooms', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const room = rooms.createRoom(request.user!.id, request.user!.username);
      return toView(room, request.user!.id);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  fastify.post<{ Params: { code: string } }>(
    '/api/games/bingo/rooms/:code/join',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const room = rooms.joinRoom(request.params.code, request.user!.id, request.user!.username);
        return toView(room, request.user!.id);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  fastify.get<{ Params: { code: string } }>(
    '/api/games/bingo/rooms/:code',
    { preHandler: requireAuth },
    async (request, reply) => {
      const room = rooms.getRoom(request.params.code);
      if (!room) return reply.code(404).send({ message: '房间不存在' });
      return toView(room, request.user!.id);
    },
  );

  fastify.post<{ Params: { code: string } }>(
    '/api/games/bingo/rooms/:code/start',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const room = rooms.startRoom(request.params.code, request.user!.id);
        return toView(room, request.user!.id);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  fastify.post<{ Params: { code: string } }>(
    '/api/games/bingo/rooms/:code/draw',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const room = rooms.drawNext(request.params.code, request.user!.id);
        return toView(room, request.user!.id);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
