import raw from './puzzles.json' with { type: 'json' };
import type { Difficulty } from './sudoku.js';

export const PUZZLES_PER_DIFFICULTY = 30;

export interface FixedPuzzle {
  id: number;
  difficulty: Difficulty;
  puzzle: number[];
}

type PuzzleBank = Record<Difficulty, number[][]>;

function bank(): PuzzleBank {
  return raw as PuzzleBank;
}

export function listPuzzles(difficulty: Difficulty): FixedPuzzle[] {
  const list = bank()[difficulty] ?? [];
  return list.slice(0, PUZZLES_PER_DIFFICULTY).map((puzzle, index) => ({
    id: index + 1,
    difficulty,
    puzzle: [...puzzle],
  }));
}

export function getPuzzle(difficulty: Difficulty, id: number): FixedPuzzle | null {
  if (!Number.isInteger(id) || id < 1 || id > PUZZLES_PER_DIFFICULTY) return null;
  return listPuzzles(difficulty).find((puzzle) => puzzle.id === id) ?? null;
}
