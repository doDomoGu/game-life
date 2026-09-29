export const POKER_MEMORY_GAME_ID = 'poker-memory';

export const pokerMemoryMeta = {
  id: POKER_MEMORY_GAME_ID,
  name: '扑克记忆翻牌',
  description: '16 张牌 8 对，翻开相同配对；翻开两张计 1 次，次数越少越好。',
  pairCount: 8,
  minFlipTurns: 8,
  maxFlipTurns: 500,
} as const;
