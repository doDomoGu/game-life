import type { WebGamePlugin } from '@game-life/shared';
import { pokerMemoryIntro } from './intro.config.js';
import { pokerMemoryMeta } from './meta.js';
import { pokerMemoryRoutes } from './routes.js';

export const pokerMemoryWebPlugin: WebGamePlugin = {
  id: pokerMemoryMeta.id,
  name: pokerMemoryMeta.name,
  description: pokerMemoryMeta.description,
  minPlayers: 1,
  maxPlayers: 1,
  cover: '🂠',
  intro: pokerMemoryIntro,
  introRouteName: pokerMemoryRoutes.introRouteName,
  introRoutePath: pokerMemoryRoutes.introRoutePath,
  playRouteName: pokerMemoryRoutes.playRouteName,
  playRoutePath: pokerMemoryRoutes.playRoutePath,
  loadPlay: () => import('./web/Play.vue'),
};
