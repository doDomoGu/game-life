import type { FastifyInstance } from 'fastify';
import type { GameHttpApp } from '@game-life/shared';
import { getRoom, requireAuth } from '@game-life/platform-server';
import { BINGO_ITEM_LABELS } from '../items.js';
import type { BingoSession, RoomPlayer } from './rooms.js';
import * as sessions from './rooms.js';
import { bingoMeta } from '../meta.js';

export interface BingoRoomView {
  code: string;
  status: 'playing' | 'finished';
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

function toView(session: BingoSession, viewerUserId: string): BingoRoomView {
  const me = session.players.find((p) => p.userId === viewerUserId);
  return {
    code: session.code,
    status: session.finished ? 'finished' : 'playing',
    hostUserId: session.hostUserId,
    players: session.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      role: p.role,
    })),
    drawnItemIds: session.drawnItemIds,
    currentItemId: session.currentItemId,
    itemLabels: BINGO_ITEM_LABELS,
    winner: session.winnerUserId
      ? { userId: session.winnerUserId, username: session.winnerUsername ?? '' }
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

  fastify.get<{ Params: { code: string } }>(
    '/api/games/bingo/rooms/:code',
    { preHandler: requireAuth },
    async (request, reply) => {
      const platform = getRoom(request.params.code);
      if (!platform || platform.gameId !== bingoMeta.id) {
        return reply.code(404).send({ message: '房间不存在' });
      }
      if (!platform.players.some((p) => p.userId === request.user!.id)) {
        return reply.code(403).send({ message: '你不在该房间' });
      }
      const session = sessions.getSession(request.params.code);
      if (!session) return reply.code(404).send({ message: '对局尚未开始' });
      return toView(session, request.user!.id);
    },
  );

  fastify.post<{ Params: { code: string } }>(
    '/api/games/bingo/rooms/:code/draw',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const platform = getRoom(request.params.code);
        if (!platform || platform.hostUserId !== request.user!.id) {
          return reply.code(403).send({ message: '仅房主可以开奖' });
        }
        const session = await sessions.drawNext(request.params.code, request.user!.id);
        return toView(session, request.user!.id);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
