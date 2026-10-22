import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { ServerGamePlugin } from './games/registry.js';
import { registerServerGames, getServerGamePlugins } from './games/registry.js';
import { configurePlatformRuntime, getPlatformRuntime } from './config/runtime.js';
import { authRoutes } from './routes/auth.routes.js';
import { gamesRoutes } from './routes/games.routes.js';
import { recordsRoutes } from './routes/records.routes.js';
import { roomRoutes } from './rooms/routes.js';

export type { ServerGamePlugin } from './games/registry.js';
export { requireAuth } from './middleware/auth.js';
export { appendRecord } from './storage/record.repository.js';
export { getRoom, finishRoom } from './rooms/store.js';

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
  await app.register(authRoutes);
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
