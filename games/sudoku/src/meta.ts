export const SUDOKU_GAME_ID = 'sudoku';

export const sudokuMeta = {
  id: SUDOKU_GAME_ID,
  name: '数独',
  description: '单人填写 9×9，可选简单、普通、困难',
  minPlayers: 1,
  maxPlayers: 1,
  minSeconds: 1,
  maxSeconds: 86_400,
} as const;
