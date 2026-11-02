export interface GuessColor {
  name: string;
  hex: string;
}

/** 前 8 种是基础色，后 2 种只在 10 色模式出现 */
export const GUESS_COLORS: GuessColor[] = [
  { name: '红', hex: '#ef4444' },
  { name: '橙', hex: '#f97316' },
  { name: '黄', hex: '#eab308' },
  { name: '绿', hex: '#22c55e' },
  { name: '青', hex: '#06b6d4' },
  { name: '蓝', hex: '#3b82f6' },
  { name: '紫', hex: '#a855f7' },
  { name: '粉', hex: '#ec4899' },
  { name: '棕', hex: '#b45309' },
  { name: '灰', hex: '#64748b' },
];

export function colorAt(index: number): GuessColor | undefined {
  return GUESS_COLORS[index];
}
