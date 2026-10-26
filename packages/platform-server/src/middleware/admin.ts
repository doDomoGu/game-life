import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { getPlatformRuntime } from '../config/runtime.js';

const ADMIN_SUBJECT = 'admin';

export function signAdminToken(): string {
  return jwt.sign({ sub: ADMIN_SUBJECT, role: 'admin' }, getPlatformRuntime().jwtSecret, {
    expiresIn: '30d',
  });
}

export function verifyAdminToken(token: string): void {
  let payload: { sub?: string; role?: string };
  try {
    payload = jwt.verify(token, getPlatformRuntime().jwtSecret) as { sub?: string; role?: string };
  } catch {
    throw Object.assign(new Error('未登录或 token 无效'), { statusCode: 401 });
  }
  if (payload.role !== 'admin' || payload.sub !== ADMIN_SUBJECT) {
    throw Object.assign(new Error('需要管理员登录'), { statusCode: 401 });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ message: '未登录' });
  }
  try {
    verifyAdminToken(header.slice('Bearer '.length));
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
        ? err.message
        : '未登录';
    return reply.code(401).send({ message });
  }
}
