import type { ServerGamePlugin } from '@game-life/shared';
import { drawGuessMeta } from './meta.js';
import { registerDrawGuessRoutes } from './server/routes.js';
import {
  abortSession,
  beginSession,
  restoreRoom,
  snapshotRoom,
} from './server/session.js';

export const drawGuessServerPlugin: ServerGamePlugin = {
  id: drawGuessMeta.id,
  name: drawGuessMeta.name,
  description: drawGuessMeta.description,
  minPlayers: drawGuessMeta.minPlayers,
  maxPlayers: drawGuessMeta.maxPlayers,
  registerHttp: registerDrawGuessRoutes,
  onStart(ctx) {
    beginSession(ctx.code, ctx.hostUserId, ctx.players);
  },
  onRoomAbort(ctx) {
    abortSession(ctx.code);
  },
  snapshotRoom(ctx) {
    return snapshotRoom(ctx.code);
  },
  restoreRoom(ctx) {
    restoreRoom(ctx.code, ctx.snapshot);
  },
};
