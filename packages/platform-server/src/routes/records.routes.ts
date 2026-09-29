import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { getDefaultGameId } from '../games/registry.js';
import * as recordService from '../services/record.service.js';

export async function recordsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { gameId?: string; page?: string; pageSize?: string } }>(
    '/api/me/records',
    { preHandler: requireAuth },
    async (request) => {
      const page = Math.max(1, Number(request.query.page ?? 1));
      const pageSize = Math.min(50, Math.max(1, Number(request.query.pageSize ?? 20)));
      const gameId = request.query.gameId;
      return recordService.getMyRecords(request.user!.id, { gameId, page, pageSize });
    },
  );

  app.get<{ Querystring: { gameId?: string } }>(
    '/api/me/stats',
    { preHandler: requireAuth },
    async (request) => {
      const gameId = request.query.gameId ?? getDefaultGameId();
      return recordService.getMyStats(request.user!.id, gameId);
    },
  );
}
