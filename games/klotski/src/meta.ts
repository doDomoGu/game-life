export const KLOTSKI_GAME_ID = 'klotski';

export const klotskiMeta = {
  id: KLOTSKI_GAME_ID,
  name: '华容道',
  description: '单人滑动棋子，把曹操移到出口',
  minPlayers: 1,
  maxPlayers: 1,
  minSteps: 1,
  maxSteps: 2000,
} as const;
