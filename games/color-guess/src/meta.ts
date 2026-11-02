export const COLOR_GUESS_GAME_ID = 'color-guess';

export const colorGuessMeta = {
  id: COLOR_GUESS_GAME_ID,
  name: '猜颜色',
  description: '4 位颜色密码，用全对/半对提示推理',
  minPlayers: 1,
  maxPlayers: 2,
} as const;
