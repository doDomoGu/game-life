import type { ServerGamePlugin } from '@game-life/shared';
import { klotskiMeta } from './meta.js';
import { validateKlotskiSubmit } from './rules.js';

export const klotskiServerPlugin: ServerGamePlugin = {
  id: klotskiMeta.id,
  name: klotskiMeta.name,
  description: klotskiMeta.description,
  minPlayers: klotskiMeta.minPlayers,
  maxPlayers: klotskiMeta.maxPlayers,
  validateSubmit: validateKlotskiSubmit,
};
