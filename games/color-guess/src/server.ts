import type { ServerGamePlugin } from '@game-life/shared';
import { colorGuessMeta } from './meta.js';
import { registerColorGuessRoutes } from './server/routes.js';
import {
  abortSession,
  beginSession,
  restoreRoom,
  snapshotRoom,
} from './server/session.js';

export const colorGuessServerPlugin: ServerGamePlugin = {
  id: colorGuessMeta.id,
  name: colorGuessMeta.name,
  description: colorGuessMeta.description,
  minPlayers: colorGuessMeta.minPlayers,
  maxPlayers: colorGuessMeta.maxPlayers,
  registerHttp: registerColorGuessRoutes,
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
