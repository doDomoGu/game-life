import type { FastifyInstance } from 'fastify';
import type { LoginBody, RegisterBody } from '@game-life/shared';
import * as authService from '../services/auth.service.js';
import * as userRepo from '../storage/user.repository.js';
import { requireAuth } from '../middleware/auth.js';

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: RegisterBody }>('/api/auth/register', async (request, reply) => {
    try {
      const result = await authService.register(request.body.username, request.body.password);
      return result;
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === 'object' && 'statusCode' in err && typeof err.statusCode === 'number'
          ? err.statusCode
          : 500;
      const message =
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : '注册失败';
      return reply.code(statusCode).send({ message });
    }
  });

  app.post<{ Body: LoginBody }>('/api/auth/login', async (request, reply) => {
    try {
      const result = await authService.login(request.body.username, request.body.password);
      return result;
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === 'object' && 'statusCode' in err && typeof err.statusCode === 'number'
          ? err.statusCode
          : 500;
      const message =
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : '登录失败';
      return reply.code(statusCode).send({ message });
    }
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    const user = await userRepo.findUserById(request.user!.id);
    if (!user) {
      throw new Error('用户不存在');
    }
    return authService.toPublic(user);
  });
}
