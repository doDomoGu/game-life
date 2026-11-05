import type { WebGamePlugin } from '@game-life/shared';
import { mahjongScoreIntro } from './intro.config.js';
import { mahjongScoreMeta } from './meta.js';
import { mahjongScoreRoutes } from './routes.js';

export const mahjongScoreWebPlugin: WebGamePlugin = {
  id: mahjongScoreMeta.id,
  name: mahjongScoreMeta.name,
  description: mahjongScoreMeta.description,
  minPlayers: mahjongScoreMeta.minPlayers,
  maxPlayers: mahjongScoreMeta.maxPlayers,
  cover: '🀄',
  intro: mahjongScoreIntro,
  introRouteName: mahjongScoreRoutes.introRouteName,
  introRoutePath: mahjongScoreRoutes.introRoutePath,
  playRouteName: mahjongScoreRoutes.playRouteName,
  playRoutePath: mahjongScoreRoutes.playRoutePath,
  loadPlay: () => import('./web/Play.vue'),
};
