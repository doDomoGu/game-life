import type { ServerGamePlugin } from '@game-life/shared';
import { mahjongWindMeta } from './meta.js';
import { abortSession, beginSession, restoreRoom, snapshotRoom } from './server/rooms.js';
import { registerMahjongWindRoutes } from './server/routes.js';

export const mahjongWindServerPlugin: ServerGamePlugin = {
  id: mahjongWindMeta.id,
  name: mahjongWindMeta.name,
  description: mahjongWindMeta.description,
  minPlayers: mahjongWindMeta.minPlayers,
  maxPlayers: mahjongWindMeta.maxPlayers,
  registerHttp: registerMahjongWindRoutes,
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
