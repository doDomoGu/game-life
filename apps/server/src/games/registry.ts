import { POKER_MEMORY_GAME_ID } from '@game-life/shared';
import { validatePokerMemorySubmit } from './poker-memory/rules.js';

export interface GameMeta {
  id: string;
  name: string;
  description: string;
}

const games: GameMeta[] = [
  {
    id: POKER_MEMORY_GAME_ID,
    name: '扑克记忆翻牌',
    description: '16 张牌 8 对，翻开相同配对；翻开两张计 1 次。',
  },
];

export function listGames(): GameMeta[] {
  return games;
}

export function getGame(id: string): GameMeta | undefined {
  return games.find((g) => g.id === id);
}

export function validateSubmit(
  gameId: string,
  rawScore: number,
  durationMs?: number,
): string | null {
  if (gameId === POKER_MEMORY_GAME_ID) {
    return validatePokerMemorySubmit(rawScore, durationMs);
  }
  return '未知游戏';
}
