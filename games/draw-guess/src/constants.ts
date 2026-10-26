export const ROUND_COUNT = 10;
export const DRAW_MS = 60_000;
export const REVEAL_MS = 5_000;
export const WRONG_BUBBLE_MS = 2_000;
export const PEN_COLORS = ['#111111', '#ef4444', '#2563eb', '#16a34a'] as const;
export type PenColor = (typeof PEN_COLORS)[number];
