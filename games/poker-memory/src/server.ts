import type { ServerGamePlugin } from '@game-life/shared';
import { pokerMemoryMeta } from './meta.js';
import { validatePokerMemorySubmit } from './rules.js';

export const pokerMemoryServerPlugin: ServerGamePlugin = {
  id: pokerMemoryMeta.id,
  name: pokerMemoryMeta.name,
  description: pokerMemoryMeta.description,
  validateSubmit: validatePokerMemorySubmit,
};
