export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: Array<{ id: Difficulty; label: string; givens: number }> = [
  { id: 'easy', label: '简单', givens: 40 },
  { id: 'normal', label: '普通', givens: 32 },
  { id: 'hard', label: '困难', givens: 26 },
];

export interface GeneratedPuzzle {
  puzzle: number[];
  solution: number[];
  difficulty: Difficulty;
}

const SIZE = 81;

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = next[i]!;
    next[i] = next[j]!;
    next[j] = current;
  }
  return next;
}

function emptyIndex(board: number[]): number {
  for (let i = 0; i < SIZE; i += 1) {
    if (board[i] === 0) return i;
  }
  return -1;
}

export function fits(board: number[], index: number, value: number): boolean {
  const row = Math.floor(index / 9);
  const col = index % 9;
  for (let i = 0; i < 9; i += 1) {
    if (board[row * 9 + i] === value || board[i * 9 + col] === value) return false;
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      if (board[(boxRow + r) * 9 + boxCol + c] === value) return false;
    }
  }
  return true;
}

function fill(board: number[]): boolean {
  const index = emptyIndex(board);
  if (index < 0) return true;
  for (const value of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (!fits(board, index, value)) continue;
    board[index] = value;
    if (fill(board)) return true;
    board[index] = 0;
  }
  return false;
}

/** 数到 limit 个解就停。用于保证挖空后仍然只有一个答案。 */
export function countSolutions(source: number[], limit = 2): number {
  const board = source.slice();
  let count = 0;

  function search(): boolean {
    const index = emptyIndex(board);
    if (index < 0) {
      count += 1;
      return count >= limit;
    }
    for (let value = 1; value <= 9; value += 1) {
      if (!fits(board, index, value)) continue;
      board[index] = value;
      if (search()) return true;
      board[index] = 0;
    }
    return false;
  }

  search();
  return count;
}

export function hasConflict(board: number[], index: number): boolean {
  const value = board[index] ?? 0;
  if (value === 0) return false;
  const row = Math.floor(index / 9);
  const col = index % 9;
  for (let i = 0; i < 9; i += 1) {
    const rowIndex = row * 9 + i;
    const colIndex = i * 9 + col;
    if (rowIndex !== index && board[rowIndex] === value) return true;
    if (colIndex !== index && board[colIndex] === value) return true;
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const boxIndex = (boxRow + r) * 9 + boxCol + c;
      if (boxIndex !== index && board[boxIndex] === value) return true;
    }
  }
  return false;
}

export function isComplete(board: number[]): boolean {
  if (board.some((value) => value === 0)) return false;
  return board.every((_, index) => !hasConflict(board, index));
}

export function generatePuzzle(difficulty: Difficulty): GeneratedPuzzle {
  const solution = Array.from({ length: SIZE }, () => 0);
  if (!fill(solution)) throw new Error('无法生成数独');
  const puzzle = solution.slice();
  const target = DIFFICULTIES.find((item) => item.id === difficulty)?.givens ?? 32;
  const order = shuffle(puzzle.map((_, index) => index));
  for (const index of order) {
    const filled = puzzle.filter((value) => value !== 0).length;
    if (filled <= target) break;
    const previous = puzzle[index] ?? 0;
    puzzle[index] = 0;
    if (countSolutions(puzzle, 2) !== 1) puzzle[index] = previous;
  }
  return { puzzle, solution, difficulty };
}

export function difficultyLabel(difficulty: Difficulty): string {
  return DIFFICULTIES.find((item) => item.id === difficulty)?.label ?? '普通';
}
