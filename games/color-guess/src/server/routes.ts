import type { FastifyInstance, FastifyReply } from 'fastify';
import type { GameHttpApp } from '@game-life/shared';
import { getRoom, requireAuth } from '@game-life/platform-server';
import { colorGuessMeta } from '../meta.js';
import { applyAction, getSession, publicView } from './session.js';

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

const base = `/api/games/${colorGuessMeta.id}/rooms/:code`;

export async function registerColorGuessRoutes(app: GameHttpApp): Promise<void> {
  const fastify = app as unknown as FastifyInstance;

  fastify.get<{ Params: { code: string } }>(base, { preHandler: requireAuth }, async (request, reply) => {
    const room = getRoom(request.params.code);
    if (!room || room.gameId !== colorGuessMeta.id) {
      return reply.code(404).send({ message: '房间不存在' });
    }
    if (!room.players.some((player) => player.userId === request.user!.id)) {
      return reply.code(403).send({ message: '你不在该房间' });
    }
    const session = getSession(request.params.code);
    if (!session) return reply.code(404).send({ message: '对局尚未开始' });
    return publicView(session, request.user!.id);
  });

  fastify.post<{ Params: { code: string }; Body: WireMessage }>(
    `${base}/action`,
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const session = await applyAction(
          request.params.code,
          request.user!.id,
          request.body ?? {},
        );
        return publicView(session, request.user!.id);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
