import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
  ChangePasswordBody,
  UpdateAvatarBody,
  UpdateProfileBody,
} from '@game-life/shared';
import { requireAuth } from '../middleware/auth.js';
import * as authService from '../services/auth.service.js';

function handleError(reply: FastifyReply, err: unknown) {
  const statusCode =
    err && typeof err === 'object' && 'statusCode' in err && typeof err.statusCode === 'number'
      ? err.statusCode
      : 500;
  const message =
    err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
      ? err.message
      : '操作失败';
  return reply.code(statusCode).send({ message });
}

export async function accountRoutes(app: FastifyInstance) {
  app.patch<{ Body: UpdateProfileBody }>(
    '/api/me/profile',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return await authService.updateProfile(
          request.user!.id,
          String(request.body?.nickname ?? ''),
        );
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.post<{ Body: UpdateAvatarBody }>(
    '/api/me/avatar',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return await authService.updateAvatar(request.user!.id, request.body?.dataUrl ?? null);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.post<{ Body: ChangePasswordBody }>(
    '/api/me/password',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        await authService.changePassword(
          request.user!.id,
          String(request.body?.currentPassword ?? ''),
          String(request.body?.newPassword ?? ''),
        );
        return { ok: true };
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
