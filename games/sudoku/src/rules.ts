import { sudokuMeta } from './meta.js';

export function validateSudokuSubmit(rawScore: number, durationMs?: number): string | null {
  if (!Number.isInteger(rawScore) || rawScore < sudokuMeta.minSeconds || rawScore > sudokuMeta.maxSeconds) {
    return '用时无效';
  }
  if (
    durationMs != null &&
    (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > sudokuMeta.maxSeconds * 1000)
  ) {
    return '用时无效';
  }
  return null;
}
