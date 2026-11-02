import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type {
  LeaderboardResponse,
  MyGameScore,
  SudokuProgress,
} from '@game-life/shared';
import { api, expectOk, register } from './helpers/api.js';
import { startTestServer, type TestServer } from './helpers/server.js';

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

async function submitSudoku(
  token: string,
  difficulty: 'easy' | 'normal' | 'hard',
  puzzleId: number,
  seconds: number,
) {
  return api(server.baseUrl, '/api/games/sudoku/records', {
    method: 'POST',
    token,
    body: {
      rawScore: seconds,
      durationMs: seconds * 1000,
      meta: { kind: 'sudoku', difficulty, puzzleId, timeMs: seconds * 1000 },
    },
  });
}

test('数独积分：按难度汇总题目完成数、最少用时和排名', async () => {
  const a = await register(server.baseUrl, 'sca');
  const b = await register(server.baseUrl, 'scb');
  const c = await register(server.baseUrl, 'scc');

  for (const [difficulty, puzzleId, seconds] of [
    ['easy', 1, 60],
    ['easy', 1, 40],
    ['easy', 2, 80],
    ['normal', 1, 100],
  ] as const) {
    expectOk(
      await submitSudoku(a.token, difficulty, puzzleId, seconds),
      `A 提交 ${difficulty} #${puzzleId}`,
    );
  }
  for (const [puzzleId, seconds] of [
    [1, 30],
    [2, 70],
    [3, 90],
  ] as const) {
    expectOk(await submitSudoku(b.token, 'easy', puzzleId, seconds), `B 提交 #${puzzleId}`);
  }
  expectOk(await submitSudoku(c.token, 'easy', 1, 50), 'C 提交 #1');

  const easy = expectOk(
    await api<LeaderboardResponse>(
      server.baseUrl,
      '/api/games/sudoku/leaderboard?difficulty=easy',
      { token: a.token },
    ),
    '读取简单积分榜',
  );
  assert.equal(easy.style, 'sudoku');
  assert.deepEqual(
    easy.entries.map((entry) => entry.username),
    [b.username, a.username, c.username],
    '先按完成题数、再按总最佳用时排序',
  );
  assert.equal(easy.entries[0]?.sudokuCompleted, 3);
  assert.equal(easy.entries[0]?.sudokuTotalBestMs, 190_000);
  assert.equal(easy.me?.rank, 2);
  assert.equal(easy.me?.sudokuCompleted, 2);
  assert.equal(easy.me?.sudokuBestTimeMs, 40_000);
  assert.equal(easy.me?.sudokuTotalBestMs, 120_000);

  const normal = expectOk(
    await api<LeaderboardResponse>(
      server.baseUrl,
      '/api/games/sudoku/leaderboard?difficulty=normal',
      { token: b.token },
    ),
    '读取普通积分榜',
  );
  assert.equal(normal.entries.length, 1);
  assert.equal(normal.entries[0]?.userId, a.userId);
  assert.equal(normal.me, null);

  const myScores = expectOk(
    await api<{ games: MyGameScore[] }>(server.baseUrl, '/api/me/scores', { token: a.token }),
    '读取个人积分',
  );
  const sudoku = myScores.games.find((game) => game.gameId === 'sudoku');
  assert.ok(sudoku);
  assert.equal(sudoku.totalGames, 4);
  assert.equal(sudoku.bestTimeMs, 40_000);
  const progress = new Map<string, SudokuProgress>(
    (sudoku.sudoku ?? []).map((item) => [item.difficulty, item]),
  );
  assert.equal(progress.get('easy')?.completed, 2);
  assert.equal(progress.get('easy')?.total, 30);
  assert.equal(progress.get('easy')?.bestTimeMs, 40_000);
  assert.deepEqual(
    progress.get('easy')?.puzzles,
    [
      { id: 1, bestTimeMs: 40_000 },
      { id: 2, bestTimeMs: 80_000 },
    ],
  );
  assert.equal(progress.get('normal')?.completed, 1);
  assert.equal(progress.get('hard')?.completed, 0);

  const invalid = await api(
    server.baseUrl,
    '/api/games/sudoku/leaderboard?difficulty=impossible',
    { token: a.token },
  );
  assert.equal(invalid.status, 400);

  const anonymous = await api(server.baseUrl, '/api/games/sudoku/leaderboard');
  assert.equal(anonymous.status, 401);
});

test('每个游戏独立积分榜：最佳次数类按最少次数聚合', async () => {
  const a = await register(server.baseUrl, 'wsa');
  const b = await register(server.baseUrl, 'wsb');
  for (const score of [12, 8]) {
    expectOk(
      await api(server.baseUrl, '/api/games/poker-memory/records', {
        method: 'POST',
        token: a.token,
        body: { rawScore: score, durationMs: score * 1000, meta: { kind: 'poker-memory' } },
      }),
      'A 扑克记忆记录',
    );
  }
  expectOk(
    await api(server.baseUrl, '/api/games/poker-memory/records', {
      method: 'POST',
      token: b.token,
      body: { rawScore: 10, durationMs: 10_000, meta: { kind: 'poker-memory' } },
    }),
    'B 扑克记忆记录',
  );

  const board = expectOk(
    await api<LeaderboardResponse>(server.baseUrl, '/api/games/poker-memory/leaderboard', {
      token: a.token,
    }),
    '读取扑克记忆积分榜',
  );
  assert.equal(board.style, 'best');
  assert.equal(board.entries[0]?.userId, a.userId);
  assert.equal(board.entries[0]?.bestScore, 8);
  assert.equal(board.entries[1]?.bestScore, 10);
  assert.equal(board.me?.rank, 1);
});
