import type { FastifyInstance, FastifyReply } from 'fastify';
import type { SudokuDifficulty } from '@game-life/shared';
import { requireAuth } from '../middleware/auth.js';
import * as scoreService from '../services/score.service.js';

function handleError(reply: FastifyReply, err: unknown) {
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

export async function scoreRoutes(app: FastifyInstance) {
  app.get<{
    Params: { gameId: string };
    Querystring: { difficulty?: string };
  }>(
    '/api/games/:gameId/leaderboard',
    { preHandler: requireAuth },
    async (request, reply) => {
      const raw = request.query.difficulty;
      const difficulty: SudokuDifficulty =
        raw === 'normal' || raw === 'hard' || raw === 'easy' ? raw : 'easy';
      if (raw != null && !['easy', 'normal', 'hard'].includes(raw)) {
        return reply.code(400).send({ message: '难度无效' });
      }
      try {
        return await scoreService.leaderboardForGame(
          request.params.gameId,
          request.user!.id,
          difficulty,
        );
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.get('/api/me/scores', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return { games: await scoreService.myScores(request.user!.id) };
    } catch (err) {
      return handleError(reply, err);
    }
  });
}
