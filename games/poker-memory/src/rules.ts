import { pokerMemoryMeta } from './meta.js';

export function validatePokerMemorySubmit(rawScore: number, durationMs?: number): string | null {
  if (!Number.isInteger(rawScore)) {
    return 'rawScore 必须为整数';
  }
  if (rawScore < pokerMemoryMeta.minFlipTurns || rawScore > pokerMemoryMeta.maxFlipTurns) {
    return `翻开次数须在 ${pokerMemoryMeta.minFlipTurns}～${pokerMemoryMeta.maxFlipTurns} 之间`;
  }
  if (durationMs !== undefined) {
    if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 60 * 60 * 1000) {
      return 'durationMs 无效';
    }
  }
  return null;
}
