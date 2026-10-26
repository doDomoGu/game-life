import { klotskiMeta } from './meta.js';

export function validateKlotskiSubmit(rawScore: number, durationMs?: number): string | null {
  if (!Number.isInteger(rawScore) || rawScore < klotskiMeta.minSteps || rawScore > klotskiMeta.maxSteps) {
    return '步数无效';
  }
  if (
    durationMs != null &&
    (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 86_400_000)
  ) {
    return '用时无效';
  }
  return null;
}
