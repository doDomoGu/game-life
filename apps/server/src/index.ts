import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from '@game-life/platform-server';
import { bingoServerPlugin } from '@game-life/game-bingo/server';
import { drawGuessServerPlugin } from '@game-life/game-draw-guess/server';
import { hanabiServerPlugin } from '@game-life/game-hanabi/server';
import { pokerMemoryServerPlugin } from '@game-life/game-poker-memory/server';
import { sudokuServerPlugin } from '@game-life/game-sudoku/server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '../data');
const webDist = process.env.WEB_DIST
  ? path.resolve(process.env.WEB_DIST)
  : path.resolve(__dirname, '../../web/dist');

await createServer({
  games: [pokerMemoryServerPlugin, bingoServerPlugin, hanabiServerPlugin, drawGuessServerPlugin, sudokuServerPlugin],
  dataDir,
  jwtSecret: process.env.JWT_SECRET,
  port: process.env.PORT ? Number(process.env.PORT) : undefined,
  staticDir: existsSync(webDist) ? webDist : undefined,
});
