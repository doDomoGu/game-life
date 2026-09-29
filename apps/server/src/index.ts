import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '@game-life/platform-server';
import { pokerMemoryServerPlugin } from '@game-life/game-poker-memory/server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '../data');

await createServer({
  games: [pokerMemoryServerPlugin],
  dataDir,
  jwtSecret: process.env.JWT_SECRET,
  port: process.env.PORT ? Number(process.env.PORT) : undefined,
});
