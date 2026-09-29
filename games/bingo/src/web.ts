import type { WebGamePlugin } from '@game-life/shared';
import { bingoIntro } from './intro.config.js';
import { bingoMeta } from './meta.js';
import { bingoRoutes } from './routes.js';

export const bingoWebPlugin: WebGamePlugin = {
  id: bingoMeta.id,
  name: bingoMeta.name,
  description: bingoMeta.description,
  minPlayers: bingoMeta.minPlayers,
  maxPlayers: bingoMeta.maxPlayers,
  cover: '🎯',
  intro: bingoIntro,
  introRouteName: bingoRoutes.introRouteName,
  introRoutePath: bingoRoutes.introRoutePath,
  loadPlay: () => import('./web/Room.vue'),
};
