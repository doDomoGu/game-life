import { BINGO_ITEM_COUNT } from '../items.js';
import { findWinningLine } from '../lines.js';
import { bingoMeta } from '../meta.js';

const SIZE = bingoMeta.gridSize;
const CELL_COUNT = SIZE * SIZE;

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 随机板：长度为 25，值为 itemId 0..24 的一个排列 */
export function createRandomBoard(): number[] {
  return shuffle(Array.from({ length: BINGO_ITEM_COUNT }, (_, i) => i));
}

export function createDrawPool(): number[] {
  return shuffle(Array.from({ length: BINGO_ITEM_COUNT }, (_, i) => i));
}

export function checkWin(marked: boolean[]): boolean {
  if (marked.length !== CELL_COUNT) return false;
  return findWinningLine(marked) !== null;
}

export function applyDraw(board: number[], marked: boolean[], itemId: number): boolean[] {
  const next = [...marked];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === itemId) next[i] = true;
  }
  return next;
}
