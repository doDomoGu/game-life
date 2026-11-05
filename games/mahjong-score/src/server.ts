import type { ServerGamePlugin } from '@game-life/shared';
import { mahjongScoreMeta } from './meta.js';
import { validateMahjongScoreSubmit } from './rules.js';

export const mahjongScoreServerPlugin: ServerGamePlugin = {
  id: mahjongScoreMeta.id,
  name: mahjongScoreMeta.name,
  description: mahjongScoreMeta.description,
  minPlayers: mahjongScoreMeta.minPlayers,
  maxPlayers: mahjongScoreMeta.maxPlayers,
  validateSubmit: validateMahjongScoreSubmit,
};
