import Fastify from 'fastify';
import cors from '@fastify/cors';
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

  await app.listen({ port, host: '0.0.0.0' });
  return app;
}
