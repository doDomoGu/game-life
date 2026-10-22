export const HANABI_GAME_ID = 'hanabi';

export const hanabiMeta = {
  id: HANABI_GAME_ID,
  name: '花火牌 HANABI',
  description: '2～5 人合作卡牌：看不到自己的手牌，靠提示按颜色与数字点亮五色烟花',
  minPlayers: 2,
  maxPlayers: 5,
} as const;
