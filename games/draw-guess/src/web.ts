import type { WebGamePlugin } from '@game-life/shared';
import { drawGuessIntro } from './intro.config.js';
import { drawGuessMeta } from './meta.js';
import { drawGuessRoutes } from './routes.js';

export const drawGuessWebPlugin: WebGamePlugin = {
  id: drawGuessMeta.id,
  name: drawGuessMeta.name,
  description: drawGuessMeta.description,
  minPlayers: drawGuessMeta.minPlayers,
  maxPlayers: drawGuessMeta.maxPlayers,
  cover: '🎨',
  intro: drawGuessIntro,
  introRouteName: drawGuessRoutes.introRouteName,
  introRoutePath: drawGuessRoutes.introRoutePath,
  loadPlay: () => import('./web/Game.vue'),
};
