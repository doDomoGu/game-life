import type { WebGamePlugin } from '@game-life/shared';
import { sudokuIntro } from './intro.config.js';
import { sudokuMeta } from './meta.js';
import { sudokuRoutes } from './routes.js';

export const sudokuWebPlugin: WebGamePlugin = {
  id: sudokuMeta.id,
  name: sudokuMeta.name,
  description: sudokuMeta.description,
  minPlayers: sudokuMeta.minPlayers,
  maxPlayers: sudokuMeta.maxPlayers,
  cover: '🔢',
  intro: sudokuIntro,
  introRouteName: sudokuRoutes.introRouteName,
  introRoutePath: sudokuRoutes.introRoutePath,
  playRouteName: sudokuRoutes.playRouteName,
  playRoutePath: sudokuRoutes.playRoutePath,
  loadPlay: () => import('./web/Play.vue'),
};
