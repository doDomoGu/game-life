function durationFromEnv(name: string, fallback: number): number {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  const value = Number(env?.[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** 生产默认 10 轮；自动化测试用环境变量缩短，浏览器端拿不到 process 时回落默认值 */
export const ROUND_COUNT = durationFromEnv('DRAW_GUESS_ROUND_COUNT', 10);
export const DRAW_MS = durationFromEnv('DRAW_GUESS_DRAW_MS', 60_000);
export const REVEAL_MS = durationFromEnv('DRAW_GUESS_REVEAL_MS', 5_000);
export const WRONG_BUBBLE_MS = 2_000;
export const PEN_COLORS = ['#111111', '#ef4444', '#2563eb', '#16a34a'] as const;
export type PenColor = (typeof PEN_COLORS)[number];
