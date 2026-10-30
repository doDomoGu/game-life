import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDraw, checkWin, createRandomBoard } from '../../../games/bingo/src/server/engine.js';
import { scoreDrawer, scoreGuess } from '../../../games/draw-guess/src/scoring.js';
import {
  startGame as startHanabi,
  playCard,
  viewGameForPlayer,
} from '../../../games/hanabi/src/server/engine.js';
import { isWin } from '../../../games/klotski/src/board.js';import { freshPieces, levelById } from '../../../games/klotski/src/levels.js';
import { solve } from '../../../games/klotski/src/solver.js';
import {
  declareRiichi,
  endMatch,
  startGame as startMahjong,
  startSettle,
  submitSettle,
} from '../../../games/mahjong-wind/src/server/engine.js';
import {
  clearPeerNotes,
  countSolutions,
  generatePuzzle,
  isComplete,
  isDigitComplete,
  toggleNote,
} from '../../../games/sudoku/src/sudoku.js';

test('数独：生成的题目唯一解，终盘合法', () => {
  const { puzzle, solution } = generatePuzzle('normal');
  assert.equal(puzzle.length, 81);
  assert.equal(solution.length, 81);
  assert.ok(isComplete(solution), '终盘应为合法完整盘面');
  assert.ok(puzzle.filter((value) => value > 0).length <= 32);
  for (let index = 0; index < 81; index += 1) {
    if (puzzle[index] !== 0) assert.equal(puzzle[index], solution[index], '题面数字必须与答案一致');
  }
  assert.equal(countSolutions(puzzle, 2), 1, '挖空后应保持唯一解');
  assert.ok(isDigitComplete(solution, 5), '终盘每个数字都出现 9 次');
});

test('数独：笔记切换与同区清除', () => {
  assert.deepEqual(toggleNote([2, 5], 3), [2, 3, 5]);
  assert.deepEqual(toggleNote([2, 3, 5], 3), [2, 5]);
  const notes = Array.from({ length: 81 }, () => [] as number[]);
  notes[0] = [1, 6];
  notes[1] = [1, 9];
  notes[10] = [1, 6];
  notes[40] = [1, 6];
  const next = clearPeerNotes(notes, 0, 1);
  assert.deepEqual(next[0], [], '当前格清空');
  assert.deepEqual(next[1], [9], '同行清除 1');
  assert.deepEqual(next[10], [6], '同列清除 1');
  assert.deepEqual(next[40], [1, 6], '无关格不受影响');
});

test('Bingo：随机板是 0..24 的排列，连线判定正确', () => {
  const board = createRandomBoard();
  assert.deepEqual(
    [...board].sort((a, b) => a - b),
    Array.from({ length: 25 }, (_, index) => index),
  );
  let marked = Array.from({ length: 25 }, () => false);
  marked = applyDraw(board, marked, board[0]!);
  assert.equal(marked[0], true);
  assert.equal(marked.filter(Boolean).length, 1, '只标记对应的格子');
  assert.equal(checkWin(marked), false);

  for (let col = 0; col < 5; col += 1) {
    marked = applyDraw(board, marked, board[col]!);
  }
  assert.equal(checkWin(marked), true, '第一行连成线');
});

test('你画我猜：按剩余秒数分档计分', () => {
  assert.equal(scoreGuess(60), 3);
  assert.equal(scoreGuess(41), 3);
  assert.equal(scoreGuess(40), 2);
  assert.equal(scoreGuess(21), 2);
  assert.equal(scoreGuess(20), 1);
  assert.equal(scoreGuess(1), 1);
  assert.equal(scoreGuess(0), 0);
  assert.equal(scoreDrawer([3, 2, 1], false), 6, '画手得猜对者分数之和');
  assert.equal(scoreDrawer([3, 2, 1], true), 0, '全员猜对画手不得分');
});

test('华容道：最简关卡的最短解可走通', () => {
  const level = levelById('jiezu');
  assert.ok(level, '捷足先登关卡存在');
  const before = JSON.parse(JSON.stringify(level.pieces)) as unknown;
  const steps = solve(level.pieces);
  assert.ok(steps, '应该能求出解');
  assert.equal(steps.length, level.minSteps, '步数应等于关卡标注的最少步数');
  const pieces = freshPieces(level);
  for (const step of steps) {
    const piece = pieces.find((item) => item.id === step.id);
    assert.ok(piece, `移动的棋子 ${step.id} 应该存在`);
    piece.x += step.dx;
    piece.y += step.dy;
  }
  assert.ok(isWin(pieces), '走完后曹操应到达出口');
  assert.deepEqual(level.pieces, before, '求解不应修改关卡棋子');
});

test('麻将：立直、结算入分和整场排名', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const game = startMahjong(ids);
  assert.equal(game.phase, 'playing');
  for (const id of ids) assert.equal(game.scores[id], 25_000);

  declareRiichi(game, 'a');
  assert.equal(game.scores.a, 24_000);
  assert.equal(game.kyotaku, 1_000);

  startSettle(game, 'win', false);
  const deltas: Record<string, number> = { a: 10_000, b: -4_000, c: -3_000, d: -2_000 };
  for (const id of ids) {
    submitSettle(game, id, deltas[id]!);
  }
  assert.equal(game.phase, 'handEnd');
  assert.equal(game.kyotaku, 0);
  assert.equal(game.scores.a, 34_000);

  endMatch(game);
  assert.equal(game.phase, 'finished');
  assert.ok(game.results);
  assert.equal(game.results.length, 4);
  assert.deepEqual(
    game.results.map((row) => row.rank).sort((a, b) => a - b),
    [1, 2, 3, 4],
  );
  const totalPt = game.results.reduce((sum, row) => sum + row.pt, 0);
  assert.ok(Math.abs(totalPt) < 1e-9, `四家 pt 合计应为 0，实际 ${totalPt}`);
});

test('花火：发牌、隐藏自己手牌、非法出牌与轮转', () => {
  const game = startHanabi([{ id: 'a' }, { id: 'b' }]);
  assert.equal(game.playerOrder.length, 2);
  assert.equal(game.hands.a!.length, 5);
  assert.equal(game.hands.b!.length, 5);
  assert.equal(game.deck.length, 40);
  assert.equal(game.playerOrder[game.turnIndex], 'a');

  const ownView = viewGameForPlayer(game, 'a');
  assert.equal(ownView.hands.a![0]!.color, undefined, '自己的手牌不显示颜色');
  assert.ok(ownView.hands.b![0]!.color, '能看到对手手牌');

  const card = game.hands.a![0]!;
  assert.throws(
    () => playCard(game, 'b', { cardId: card.id }),
    /还没轮到你/,
    '不是当前玩家不能出牌',
  );
  playCard(game, 'a', { cardId: card.id });
  assert.equal(game.lastActions.length, 1);
  assert.equal(game.playerOrder[game.turnIndex], 'b');
});
