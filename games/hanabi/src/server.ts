import type { ServerGamePlugin } from '@game-life/shared';
import { hanabiMeta } from './meta.js';
import { beginSession } from './server/rooms.js';
import { registerHanabiRoutes } from './server/routes.js';

export const hanabiServerPlugin: ServerGamePlugin = {
  id: hanabiMeta.id,
  name: hanabiMeta.name,
  description: hanabiMeta.description,
  minPlayers: hanabiMeta.minPlayers,
  maxPlayers: hanabiMeta.maxPlayers,
  registerHttp: registerHanabiRoutes,
  onStart(ctx) {
    beginSession(ctx.code, ctx.hostUserId, ctx.players);
  },
};
