export type SudokuDifficulty = 'easy' | 'normal' | 'hard';

export interface SudokuPuzzleBest {
  id: number;
  bestTimeMs: number;
}

export interface SudokuProgress {
  difficulty: SudokuDifficulty;
  completed: number;
  total: number;
  bestTimeMs: number | null;
  totalBestMs: number | null;
  puzzles: SudokuPuzzleBest[];
}

export interface MyGameScore {
  gameId: string;
  gameName: string;
  style: LeaderboardStyle;
  totalGames: number;
  wins: number | null;
  bestTimeMs: number | null;
  bestScore: number | null;
  sudoku: SudokuProgress[] | null;
}

export type LeaderboardStyle = 'sudoku' | 'wins' | 'time' | 'score' | 'best';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  games: number;
  wins: number;
  bestTimeMs: number | null;
  bestScore: number | null;
  sudokuCompleted: number | null;
  sudokuBestTimeMs: number | null;
  sudokuTotalBestMs: number | null;
}

export interface LeaderboardResponse {
  gameId: string;
  gameName: string;
  style: LeaderboardStyle;
  difficulty: SudokuDifficulty | null;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}
