export { COLOR_LABELS, COLORS, type Color } from '../colors.js';

export function resultText(
  result: 'win' | 'lose' | 'score' | null,
  score: number | null,
  label: string | null,
): string {
  if (result === 'win') return `满分胜利！${score ?? 25} 分 · ${label ?? 'Legendary'}`;
  if (result === 'lose') return `三次失误，表演失败… 得分 ${score ?? 0}`;
  if (result === 'score') return `终局得分 ${score ?? 0} · ${label ?? ''}`.trim();
  return '';
}
