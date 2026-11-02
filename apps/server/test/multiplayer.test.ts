import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { ColorGuessView } from '../../../games/color-guess/src/view.js';
import { RACE_ATTEMPTS_PER_PLAYER, scoreGuess } from '../../../games/color-guess/src/engine.js';
import { api, expectOk, recordsFor, waitForRoom } from './helpers/api.js';
import { playBingo, playDrawGuess, playHanabi, playMahjong } from './helpers/bots.js';
import { prepareRoom, startPrepared, type RoomFixture } from './helpers/room.js';
import { startTestServer, type TestServer } from './helpers/server.js';

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

async function assertAllHaveRecords(fixture: RoomFixture, gameId: string): Promise<void> {
  for (const account of fixture.accounts) {
    const page = await recordsFor(server.baseUrl, account.token, gameId);
    assert.ok(page.total >= 1, `${account.username} 应该有一局 ${gameId} 战绩`);
  }
}

async function playToNaturalFinish(
  gameId: string,
  count: number,
  play: (fixture: RoomFixture) => Promise<void>,
): Promise<RoomFixture> {
  const fixture = await prepareRoom(server.baseUrl, gameId, count, `m${gameId.slice(0, 4)}`);
  await startPrepared(server.baseUrl, fixture);
  await play(fixture);
  const finished = await waitForRoom(
    server.baseUrl,
    fixture.host.token,
    fixture.room.code,
    (room) => room.status === 'finished',
    `${gameId} 自然结束`,
    15_000,
  );
  assert.equal(finished.endReason, 'finished');
  return fixture;
}

test('Bingo：两人开奖到出 winner，两边都写战绩', async () => {
  const fixture = await playToNaturalFinish('bingo', 2, (room) =>
    playBingo(server.baseUrl, room),
  );
  await assertAllHaveRecords(fixture, 'bingo');
});

test('花火牌：两人轮流出牌跑完整局，两边都写战绩', async () => {
  const fixture = await prepareRoom(server.baseUrl, 'hanabi', 2, 'mhan');
  await startPrepared(server.baseUrl, fixture);
  const state = await api(
    server.baseUrl,
    `/api/games/hanabi/rooms/${fixture.room.code}`,
    { token: fixture.accounts[0]!.token },
  );
  assert.equal(state.status, 200, '对局中重新取得牌局状态');
  await playHanabi(server.baseUrl, fixture);
  const finished = await waitForRoom(
    server.baseUrl,
    fixture.host.token,
    fixture.room.code,
    (room) => room.status === 'finished',
    '花火牌自然结束',
    15_000,
  );
  assert.equal(finished.endReason, 'finished');
  await assertAllHaveRecords(fixture, 'hanabi');
});

test('立直麻将：四家流局结算后结束整场，四人都写战绩', async () => {
  const fixture = await prepareRoom(server.baseUrl, 'mahjong-wind', 4, 'mmah');
  await startPrepared(server.baseUrl, fixture);
  const state = await api(
    server.baseUrl,
    `/api/games/mahjong-wind/rooms/${fixture.room.code}`,
    { token: fixture.host.token },
  );
  assert.equal(state.status, 200, '对局中重新取得麻将状态');
  await playMahjong(server.baseUrl, fixture);
  const finished = await waitForRoom(
    server.baseUrl,
    fixture.host.token,
    fixture.room.code,
    (room) => room.status === 'finished',
    '麻将自然结束',
    15_000,
  );
  assert.equal(finished.endReason, 'finished');
  await assertAllHaveRecords(fixture, 'mahjong-wind');
});

test('你画我猜：缩短轮次后两人跑完计时器，两人都写战绩', async () => {
  const fixture = await playToNaturalFinish('draw-guess', 2, (room) =>
    playDrawGuess(server.baseUrl, room),
  );
  await assertAllHaveRecords(fixture, 'draw-guess');
});

async function colorGuessAction(
  code: string,
  token: string,
  type: string,
  payload?: Record<string, unknown>,
): Promise<{ status: number; data: ColorGuessView }> {
  return api<ColorGuessView>(server.baseUrl, `/api/games/color-guess/rooms/${code}/action`, {
    method: 'POST',
    token,
    body: { type, payload },
  });
}

async function startColorSetterRoom(fixture: RoomFixture): Promise<void> {
  const [host, guest] = fixture.accounts;
  assert.ok(host && guest);
  expectOk(
    await colorGuessAction(fixture.room.code, host.token, 'action:config', {
      mode: 'setter',
      setterChoice: host.userId,
      paletteSize: 8,
      allowDuplicates: false,
    }),
    '猜颜色设置出题模式',
  );
  expectOk(
    await colorGuessAction(fixture.room.code, host.token, 'action:start'),
    '猜颜色开始对局',
  );
  expectOk(
    await colorGuessAction(fixture.room.code, host.token, 'action:secret', {
      colors: [0, 1, 2, 3],
    }),
    '出题者设置密码',
  );
}

test('猜颜色：答题者猜中获胜，反馈半对/全对正确', async () => {
  const fixture = await prepareRoom(server.baseUrl, 'color-guess', 2, 'mcga');
  await startPrepared(server.baseUrl, fixture);
  await startColorSetterRoom(fixture);
  const [host, guest] = fixture.accounts;
  assert.ok(host && guest);

  const wrong = expectOk(
    await colorGuessAction(fixture.room.code, guest.token, 'action:guess', {
      colors: [3, 2, 1, 0],
    }),
    '答题者猜错',
  );
  const attempt = wrong.boards[guest.userId]?.attempts[0];
  assert.equal(attempt?.exact, 0);
  assert.equal(attempt?.partial, 4, '颜色全对位置全错应是 4 个半对');

  const solved = expectOk(
    await colorGuessAction(fixture.room.code, guest.token, 'action:guess', {
      colors: [0, 1, 2, 3],
    }),
    '答题者猜中',
  );
  assert.equal(solved.phase, 'finished');
  assert.equal(solved.winnerId, guest.userId);

  await waitForRoom(
    server.baseUrl,
    host.token,
    fixture.room.code,
    (room) => room.status === 'finished',
    '猜颜色答题者获胜后房间结束',
  );
  await assertAllHaveRecords(fixture, 'color-guess');
});

test('猜颜色：10 次未猜中时出题者获胜', async () => {
  const fixture = await prepareRoom(server.baseUrl, 'color-guess', 2, 'mcgb');
  await startPrepared(server.baseUrl, fixture);
  await startColorSetterRoom(fixture);
  const [host, guest] = fixture.accounts;
  assert.ok(host && guest);

  let last;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    last = expectOk(
      await colorGuessAction(fixture.room.code, guest.token, 'action:guess', {
        colors: [3, 2, 1, 0],
      }),
      `答题者第 ${attempt + 1} 次猜测`,
    );
  }
  assert.equal(last?.phase, 'finished');
  assert.equal(last?.winnerId, host.userId, '10 次未猜中由出题者获胜');
  assert.equal(last?.secret?.join(','), '0,1,2,3', '结算后公开密码');

  await waitForRoom(
    server.baseUrl,
    host.token,
    fixture.room.code,
    (room) => room.status === 'finished',
    '猜颜色出题者获胜后房间结束',
  );
  await assertAllHaveRecords(fixture, 'color-guess');
});

function colorCandidates(paletteSize = 8): number[][] {
  const result: number[][] = [];
  for (let a = 0; a < paletteSize; a += 1) {
    for (let b = 0; b < paletteSize; b += 1) {
      if (b === a) continue;
      for (let c = 0; c < paletteSize; c += 1) {
        if (c === a || c === b) continue;
        for (let d = 0; d < paletteSize; d += 1) {
          if (d === a || d === b || d === c) continue;
          result.push([a, b, c, d]);
        }
      }
    }
  }
  return result;
}

function narrow(candidates: number[][], guess: number[], exact: number, partial: number): number[][] {
  return candidates.filter((candidate) => {
    const feedback = scoreGuess(candidate, guess);
    return feedback.exact === exact && feedback.partial === partial;
  });
}

/** 简单 minimax：挑一个能把候选集切得最均匀的猜测，尽量在 5 次内解出 */
function chooseGuess(candidates: number[][]): number[] {
  if (candidates.length <= 2) return candidates[0]!;
  let best = candidates[0]!;
  let bestWorst = Number.POSITIVE_INFINITY;
  for (const guess of candidates) {
    const buckets = new Map<string, number>();
    let worst = 0;
    for (const secret of candidates) {
      const feedback = scoreGuess(secret, guess);
      const key = `${feedback.exact},${feedback.partial}`;
      const count = (buckets.get(key) ?? 0) + 1;
      buckets.set(key, count);
      if (count > worst) worst = count;
      if (worst >= bestWorst) break;
    }
    if (worst < bestWorst) {
      bestWorst = worst;
      best = guess;
    }
  }
  return best;
}

test('猜颜色：单人系统出题可以在 10 次内推理出来', async () => {
  const fixture = await prepareRoom(server.baseUrl, 'color-guess', 1, 'mcgs');
  await startPrepared(server.baseUrl, fixture);
  const user = fixture.accounts[0]!;
  let view = expectOk(
    await colorGuessAction(fixture.room.code, user.token, 'action:start'),
    '单人开始猜颜色',
  );
  let candidates = colorCandidates();
  for (let attempt = 0; attempt < 10 && view.phase === 'guessing'; attempt += 1) {
    const guess = candidates[0]!;
    view = expectOk(
      await colorGuessAction(fixture.room.code, user.token, 'action:guess', { colors: guess }),
      `单人第 ${attempt + 1} 次猜测`,
    );
    const feedback = view.boards[user.userId]?.attempts.at(-1);
    assert.ok(feedback);
    if (feedback.exact === 4) break;
    candidates = narrow(candidates, guess, feedback.exact, feedback.partial);
  }
  assert.equal(view.phase, 'finished');
  assert.equal(view.winnerId, user.userId);
  await waitForRoom(
    server.baseUrl,
    user.token,
    fixture.room.code,
    (room) => room.status === 'finished',
    '猜颜色单人胜利后房间结束',
  );
  await assertAllHaveRecords(fixture, 'color-guess');
});

test('猜颜色：双人竞速轮流猜，10 轮内分出胜负或平局', async () => {
  const fixture = await prepareRoom(server.baseUrl, 'color-guess', 2, 'mcgr');
  await startPrepared(server.baseUrl, fixture);
  const [host, guest] = fixture.accounts;
  assert.ok(host && guest);
  let view = expectOk(
    await colorGuessAction(fixture.room.code, host.token, 'action:start'),
    '竞速开始',
  );
  assert.equal(view.config.mode, 'race');
  assert.equal(view.attemptLimit, RACE_ATTEMPTS_PER_PLAYER);
  const candidates = new Map(fixture.accounts.map((account) => [account.userId, colorCandidates()]));
  let previous: string | null = null;

  for (let turn = 0; turn < 10 && view.phase === 'guessing'; turn += 1) {
    const currentId = view.turnUserId!;
    assert.notEqual(currentId, previous, '竞速必须轮流猜');
    previous = currentId;
    const actor = fixture.accounts.find((account) => account.userId === currentId);
    assert.ok(actor, '当前回合玩家存在');
    const pool = candidates.get(currentId)!;
    const guess = chooseGuess(pool);
    view = expectOk(
      await colorGuessAction(fixture.room.code, actor.token, 'action:guess', { colors: guess }),
      `第 ${turn + 1} 次猜测`,
    );
    const feedback = view.boards[currentId]?.attempts.at(-1);
    assert.ok(feedback);
    candidates.set(currentId, narrow(pool, guess, feedback.exact, feedback.partial));
  }
  assert.equal(view.phase, 'finished');
  if (view.result === 'draw') {
    assert.equal(view.winnerId, null);
    for (const account of fixture.accounts) {
      assert.equal(
        view.boards[account.userId]?.attempts.length,
        RACE_ATTEMPTS_PER_PLAYER,
        '10 轮打平时每人正好 5 次',
      );
    }
  } else {
    assert.ok(
      view.winnerId === host.userId || view.winnerId === guest.userId,
      '竞速应产生获胜者',
    );
  }
  await waitForRoom(
    server.baseUrl,
    host.token,
    fixture.room.code,
    (room) => room.status === 'finished',
    '猜颜色竞速结束后房间结束',
  );
  await assertAllHaveRecords(fixture, 'color-guess');
});
