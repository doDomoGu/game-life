export const CODE_LENGTH = 4;
export const MAX_ATTEMPTS = 10;
/** 双人竞速总共 10 轮，轮流猜时每人最多 5 次 */
export const RACE_ATTEMPTS_PER_PLAYER = MAX_ATTEMPTS / 2;

export interface GuessFeedback {
  exact: number;
  partial: number;
}

/** 全对：颜色和位置都对；半对：颜色对但位置不对，重复颜色按出现次数计 */
export function scoreGuess(secret: readonly number[], guess: readonly number[]): GuessFeedback {
  let exact = 0;
  const secretRest = new Map<number, number>();
  const guessRest = new Map<number, number>();
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    const left = secret[index];
    const right = guess[index];
    if (left === right) {
      exact += 1;
    } else {
      if (left != null) secretRest.set(left, (secretRest.get(left) ?? 0) + 1);
      if (right != null) guessRest.set(right, (guessRest.get(right) ?? 0) + 1);
    }
  }
  let partial = 0;
  for (const [color, count] of secretRest) {
    partial += Math.min(count, guessRest.get(color) ?? 0);
  }
  return { exact, partial };
}

export function validateCode(
  code: unknown,
  paletteSize: number,
  allowDuplicates: boolean,
): string | null {
  if (!Array.isArray(code) || code.length !== CODE_LENGTH) {
    return `需要 ${CODE_LENGTH} 个颜色`;
  }
  for (const value of code) {
    if (!Number.isInteger(value) || value < 0 || value >= paletteSize) {
      return '颜色不在可选范围内';
    }
  }
  if (!allowDuplicates && new Set(code).size !== CODE_LENGTH) {
    return '当前配置不允许重复颜色';
  }
  return null;
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

export function randomSecret(paletteSize: number, allowDuplicates: boolean): number[] {
  if (allowDuplicates) {
    return Array.from({ length: CODE_LENGTH }, () => randomInt(paletteSize));
  }
  const pool = Array.from({ length: paletteSize }, (_, index) => index);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [pool[index], pool[swap]] = [pool[swap]!, pool[index]!];
  }
  return pool.slice(0, CODE_LENGTH);
}
