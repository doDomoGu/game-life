import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { authRoutes } from './routes/auth.routes.js';
import { gamesRoutes } from './routes/games.routes.js';
import { recordsRoutes } from './routes/records.routes.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(authRoutes);
await app.register(gamesRoutes);
await app.register(recordsRoutes);

app.get('/api/health', async () => ({ ok: true }));

try {
  await app.listen({ port: env.port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
