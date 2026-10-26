import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import type { ServerGamePlugin } from './games/registry.js';
import { registerServerGames, getServerGamePlugins } from './games/registry.js';
import { configurePlatformRuntime, getPlatformRuntime } from './config/runtime.js';
import { adminRoutes } from './routes/admin.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { gamesRoutes } from './routes/games.routes.js';
import { recordsRoutes } from './routes/records.routes.js';
import { roomRoutes } from './rooms/routes.js';

export type { ServerGamePlugin } from './games/registry.js';
export { requireAuth } from './middleware/auth.js';
export { authenticateToken } from './services/auth.service.js';
export { appendRecord } from './storage/record.repository.js';
export { getRoom, finishRoom, resetRoom, startRoom } from './rooms/store.js';
export {
  REALTIME_PING_INTERVAL_MS,
  REALTIME_STALE_MS,
  bindSocket,
  unbindSocket,
  noteSeen,
  refreshStale,
  sendJson,
  type PresenceMember,
  type PresenceSocket,
} from './realtime/presence.js';
export { acceptPlayerSocket, type RealtimeMessage, type RealtimeSocket } from './realtime/accept.js';

export interface CreateServerOptions {
  games: ServerGamePlugin[];
  dataDir: string;
  jwtSecret?: string;
  port?: number;
  /** 前端构建产物目录，提供后由 Node 同时托管静态页与 SPA 回退 */
  staticDir?: string;
}

export async function createServer(options: CreateServerOptions) {
  registerServerGames(options.games);
  configurePlatformRuntime({
    dataDir: options.dataDir,
    jwtSecret: options.jwtSecret ?? process.env.JWT_SECRET ?? 'dev-secret-change-me',
    port: options.port ?? Number(process.env.PORT ?? 3000),
  });

  const { port } = getPlatformRuntime();
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  // WebSocket 插件必须在路由之前注册，游戏的实时通道才能复用同一条 HTTP 服务
  await app.register(websocket);
  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(gamesRoutes);
  await app.register(recordsRoutes);
  await app.register(roomRoutes);

  for (const game of getServerGamePlugins()) {
    if (game.registerHttp) {
      await game.registerHttp(app as import('@game-life/shared').GameHttpApp);
    }
  }

  app.get('/api/health', async () => ({ ok: true }));

  if (options.staticDir) {
    const root = path.resolve(options.staticDir);
    if (existsSync(root)) {
      await app.register(fastifyStatic, { root, wildcard: false });

      app.get('/*', async (request, reply) => {
        const raw = request.url.split('?')[0] ?? '/';
        if (raw.startsWith('/api')) {
          return reply.code(404).send({ message: 'Not Found' });
        }
        let relative: string;
        try {
          relative = decodeURIComponent(raw).replace(/^\/+/, '');
        } catch {
          return reply.code(400).send({ message: 'Bad Request' });
        }
        const candidate = path.resolve(root, relative);
        if (
          candidate.startsWith(`${root}${path.sep}`) &&
          existsSync(candidate) &&
          statSync(candidate).isFile()
        ) {
          return reply.sendFile(relative);
        }
        return reply.sendFile('index.html');
      });
    }
  }

  await app.listen({ port, host: '0.0.0.0' });
  return app;
}
