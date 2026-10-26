export const DRAW_GUESS_GAME_ID = 'draw-guess';

export const drawGuessMeta = {
  id: DRAW_GUESS_GAME_ID,
  name: '你画我猜',
  description: '2～8 人轮流画画，其他人按字数边看边猜',
  minPlayers: 2,
  maxPlayers: 8,
} as const;
