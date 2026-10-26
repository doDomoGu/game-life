import type { ServerGamePlugin } from '@game-life/shared';
import { sudokuMeta } from './meta.js';
import { validateSudokuSubmit } from './rules.js';

export const sudokuServerPlugin: ServerGamePlugin = {
  id: sudokuMeta.id,
  name: sudokuMeta.name,
  description: sudokuMeta.description,
  minPlayers: sudokuMeta.minPlayers,
  maxPlayers: sudokuMeta.maxPlayers,
  validateSubmit: validateSudokuSubmit,
};
