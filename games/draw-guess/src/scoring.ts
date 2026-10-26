export interface GuessBand {
  minRemainingSec: number;
  maxRemainingSec: number;
  points: number;
}

export interface ScoringConfig {
  guessBands: GuessBand[];
}

/** 计分会改。只改这里和下面两个函数，不动回合流程。 */
export const scoringConfig: ScoringConfig = {
  guessBands: [
    { minRemainingSec: 41, maxRemainingSec: 60, points: 3 },
    { minRemainingSec: 21, maxRemainingSec: 40, points: 2 },
    { minRemainingSec: 1, maxRemainingSec: 20, points: 1 },
  ],
};

export function scoreGuess(remainingSec: number, config: ScoringConfig = scoringConfig): number {
  const sec = Math.trunc(remainingSec);
  const band = config.guessBands.find((item) => sec >= item.minRemainingSec && sec <= item.maxRemainingSec);
  return band?.points ?? 0;
}

export function scoreDrawer(
  guesserPoints: number[],
  allGuessersCorrect: boolean,
  _config: ScoringConfig = scoringConfig,
): number {
  if (allGuessersCorrect) return 0;
  return guesserPoints.reduce((sum, points) => sum + points, 0);
}
