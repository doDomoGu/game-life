import type { FastifyInstance } from 'fastify';
import type { LoginBody } from '@game-life/shared';
import { adminUsername, matchesAdmin } from '../admin/account.js';
import { requireAdmin, signAdminToken } from '../middleware/admin.js';
import * as userRepo from '../storage/user.repository.js';

export async function adminRoutes(app: FastifyInstance) {
  app.post<{ Body: LoginBody }>('/api/admin/login', async (request, reply) => {
    const username = String(request.body?.username ?? '').trim();
    const password = String(request.body?.password ?? '');
    const ok = await matchesAdmin(username, password);
    if (!ok) {
      return reply.code(401).send({ message: '用户名或密码错误' });
    }
    return { token: signAdminToken(), username: adminUsername };
  });

  app.get('/api/admin/users', { preHandler: requireAdmin }, async () => {
    const users = await userRepo.listUsers();
    return {
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
      })),
    };
  });
}
