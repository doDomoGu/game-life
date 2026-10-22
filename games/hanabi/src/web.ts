import type { WebGamePlugin } from '@game-life/shared';
import { hanabiIntro } from './intro.config.js';
import { hanabiMeta } from './meta.js';
import { hanabiRoutes } from './routes.js';

export const hanabiWebPlugin: WebGamePlugin = {
  id: hanabiMeta.id,
  name: hanabiMeta.name,
  description: hanabiMeta.description,
  minPlayers: hanabiMeta.minPlayers,
  maxPlayers: hanabiMeta.maxPlayers,
  cover: '🎆',
  intro: hanabiIntro,
  introRouteName: hanabiRoutes.introRouteName,
  introRoutePath: hanabiRoutes.introRoutePath,
  loadPlay: () => import('./web/Game.vue'),
};
