import { POKER_MEMORY } from '@game-life/shared';

export function validatePokerMemorySubmit(rawScore: number, durationMs?: number): string | null {
  if (!Number.isInteger(rawScore)) {
    return 'rawScore 必须为整数';
  }
  if (rawScore < POKER_MEMORY.minFlipTurns || rawScore > POKER_MEMORY.maxFlipTurns) {
    return `翻开次数须在 ${POKER_MEMORY.minFlipTurns}～${POKER_MEMORY.maxFlipTurns} 之间`;
  }
  if (durationMs !== undefined) {
    if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 60 * 60 * 1000) {
      return 'durationMs 无效';
    }
  }
  return null;
}
