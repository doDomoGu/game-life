import type { FastifyReply, FastifyRequest } from 'fastify';
import * as authService from '../services/auth.service.js';
import * as userRepo from '../storage/user.repository.js';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ message: '未登录' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const { userId } = authService.verifyToken(token);
    const user = await userRepo.findUserById(userId);
    if (!user) {
      return reply.code(401).send({ message: '用户不存在' });
    }
    request.user = { id: user.id, username: user.username };
  } catch (err: unknown) {
    const statusCode =
      err && typeof err === 'object' && 'statusCode' in err && typeof err.statusCode === 'number'
        ? err.statusCode
        : 401;
    const message =
      err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
        ? err.message
        : '未登录';
    return reply.code(statusCode).send({ message });
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; username: string };
  }
}
