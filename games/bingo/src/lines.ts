import { bingoMeta } from './meta.js';

const SIZE = bingoMeta.gridSize;

/** 12 条获胜线（5 横 + 5 竖 + 2 斜） */
export const WIN_LINES: number[][] = (() => {
  const lines: number[][] = [];
  for (let r = 0; r < SIZE; r++) {
    lines.push(Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
  }
  for (let c = 0; c < SIZE; c++) {
    lines.push(Array.from({ length: SIZE }, (_, r) => r * SIZE + c));
  }
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
})();

/** 返回第一条已点亮的线，没有则返回 null */
export function findWinningLine(marked: boolean[]): number[] | null {
  if (marked.length !== SIZE * SIZE) return null;
  return WIN_LINES.find((line) => line.every((idx) => marked[idx])) ?? null;
}
