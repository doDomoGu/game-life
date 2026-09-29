import type { ServerGamePlugin } from '@game-life/shared';
import { bingoMeta } from './meta.js';
import { beginSession } from './server/rooms.js';
import { registerBingoRoutes } from './server/routes.js';

export const bingoServerPlugin: ServerGamePlugin = {
  id: bingoMeta.id,
  name: bingoMeta.name,
  description: bingoMeta.description,
  minPlayers: bingoMeta.minPlayers,
  maxPlayers: bingoMeta.maxPlayers,
  registerHttp: registerBingoRoutes,
  onStart(ctx) {
    beginSession(ctx.code, ctx.players);
  },
};
