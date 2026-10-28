import type { WebGamePlugin } from '@game-life/shared';
import { mahjongWindIntro } from './intro.config.js';
import { mahjongWindMeta } from './meta.js';
import { mahjongWindRoutes } from './routes.js';

export const mahjongWindWebPlugin: WebGamePlugin = {
  id: mahjongWindMeta.id,
  name: mahjongWindMeta.name,
  description: mahjongWindMeta.description,
  minPlayers: mahjongWindMeta.minPlayers,
  maxPlayers: mahjongWindMeta.maxPlayers,
  cover: '🀄',
  intro: mahjongWindIntro,
  introRouteName: mahjongWindRoutes.introRouteName,
  introRoutePath: mahjongWindRoutes.introRoutePath,
  exitInGame: true,
  loadPlay: () => import('./web/Game.vue'),
};
