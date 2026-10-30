import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { api, recordsFor, waitForRoom } from './helpers/api.js';
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
