import type { WebGamePlugin } from '@game-life/shared';
import { colorGuessIntro } from './intro.config.js';
import { colorGuessMeta } from './meta.js';
import { colorGuessRoutes } from './routes.js';

export const colorGuessWebPlugin: WebGamePlugin = {
  id: colorGuessMeta.id,
  name: colorGuessMeta.name,
  description: colorGuessMeta.description,
  minPlayers: colorGuessMeta.minPlayers,
  maxPlayers: colorGuessMeta.maxPlayers,
  cover: '🌈',
  intro: colorGuessIntro,
  introRouteName: colorGuessRoutes.introRouteName,
  introRoutePath: colorGuessRoutes.introRoutePath,
  loadPlay: () => import('./web/Game.vue'),
};
