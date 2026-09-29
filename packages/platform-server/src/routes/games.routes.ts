import type { FastifyInstance } from 'fastify';
import type { SubmitRecordBody } from '@game-life/shared';
import { listGames, getGame } from '../games/registry.js';
import { requireAuth } from '../middleware/auth.js';
import * as recordService from '../services/record.service.js';

export async function gamesRoutes(app: FastifyInstance) {
  app.get('/api/games', async () => listGames());

  app.post<{ Params: { gameId: string }; Body: SubmitRecordBody }>(
    '/api/games/:gameId/records',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { gameId } = request.params;
      if (!getGame(gameId)) {
        return reply.code(404).send({ message: '游戏不存在' });
      }
      try {
        const record = await recordService.submitRecord(request.user!.id, gameId, request.body);
        return record;
      } catch (err: unknown) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err && typeof err.statusCode === 'number'
            ? err.statusCode
            : 500;
        const message =
          err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
            ? err.message
            : '提交失败';
        return reply.code(statusCode).send({ message });
      }
    },
  );
}
