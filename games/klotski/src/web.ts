import type { WebGamePlugin } from '@game-life/shared';
import { klotskiIntro } from './intro.config.js';
import { klotskiMeta } from './meta.js';
import { klotskiRoutes } from './routes.js';

export const klotskiWebPlugin: WebGamePlugin = {
  id: klotskiMeta.id,
  name: klotskiMeta.name,
  description: klotskiMeta.description,
  minPlayers: klotskiMeta.minPlayers,
  maxPlayers: klotskiMeta.maxPlayers,
  cover: '🏯',
  intro: klotskiIntro,
  introRouteName: klotskiRoutes.introRouteName,
  introRoutePath: klotskiRoutes.introRoutePath,
  playRouteName: klotskiRoutes.playRouteName,
  playRoutePath: klotskiRoutes.playRoutePath,
  loadPlay: () => import('./web/Play.vue'),
};
