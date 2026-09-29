export const BINGO_GAME_ID = 'bingo';

export const bingoMeta = {
  id: BINGO_GAME_ID,
  name: 'Bingo',
  description: '5×5 格子多人对战，先连成一线者获胜（1～8 人）',
  maxPlayers: 8,
  minPlayers: 1,
  gridSize: 5,
} as const;
