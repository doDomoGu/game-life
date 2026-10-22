export const COLORS = ['red', 'yellow', 'green', 'blue', 'white'] as const;

export type Color = (typeof COLORS)[number];

export const COLOR_LABELS: Record<Color, string> = {
  red: '红',
  yellow: '黄',
  green: '绿',
  blue: '蓝',
  white: '白',
};
