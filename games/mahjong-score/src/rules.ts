import { mahjongScoreMeta } from './meta.js';

export function validateMahjongScoreSubmit(rawScore: number, durationMs?: number): string | null {
  if (!Number.isInteger(rawScore) || rawScore < mahjongScoreMeta.minScore || rawScore > mahjongScoreMeta.maxScore) {
    return '成绩无效';
  }
  if (durationMs != null && (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 86_400_000)) {
    return '用时无效';
  }
  return null;
}
