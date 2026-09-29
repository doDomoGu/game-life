import type { WebGamePlugin } from '@game-life/shared';
import { bingoIntro } from './intro.config.js';
import { bingoMeta } from './meta.js';
import { bingoRoutes } from './routes.js';

export const bingoWebPlugin: WebGamePlugin = {
  id: bingoMeta.id,
  name: bingoMeta.name,
  description: bingoMeta.description,
  cover: '🎯',
  intro: bingoIntro,
  introRouteName: bingoRoutes.introRouteName,
  introRoutePath: bingoRoutes.introRoutePath,
  extraRoutes: [
    {
      path: bingoRoutes.roomLobbyPath,
      name: bingoRoutes.roomLobbyRouteName,
      load: () => import('./web/RoomLobby.vue'),
    },
    {
      path: bingoRoutes.roomPath,
      name: bingoRoutes.roomRouteName,
      load: () => import('./web/Room.vue'),
    },
  ],
};
