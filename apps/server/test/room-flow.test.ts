import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  api,
  backToWaiting,
  castVote,
  endVote,
  expectOk,
  getRoom,
  kickPlayer,
  leaveRoom,
  listGames,
  myRoom,
  register,
  rematchVote,
  selectGame,
  startRoom,
  type GameMeta,
} from './helpers/api.js';
import {
  endGameByVote,
  finishSoloRoom,
  prepareRoom,
  requestRematch,
  startPrepared,
} from './helpers/room.js';
import { startTestServer, type TestServer } from './helpers/server.js';

let server: TestServer;
let games: GameMeta[];

before(async () => {
  server = await startTestServer();
  games = await listGames(server.baseUrl);
});

after(async () => {
  await server.close();
});

test('每种游戏都能完成准备、开始、结束与再来一局', async (t) => {
  for (const game of games) {
    await t.test(`${game.name}（${game.id}）`, async () => {
      const multiplayer = game.maxPlayers > 1;
      const count = multiplayer ? Math.max(2, game.minPlayers) : 1;
      const fixture = await prepareRoom(server.baseUrl, game.id, count, `g${game.id.slice(0, 4)}`);

      if (multiplayer) {
        const early = await startRoom(server.baseUrl, fixture.host.token, fixture.room.code);
        assert.equal(early.status, 400, '有玩家未准备时不能开始');
      }

      const started = await startPrepared(server.baseUrl, fixture);
      assert.equal(started.roundId, 1, '开局后 roundId 从 1 开始');
      assert.equal(started.playerCount, count);

      if (multiplayer) {
        const guest = fixture.accounts[1]!;
        const leave = await leaveRoom(server.baseUrl, guest.token);
        assert.equal(leave.status, 409, '多人对局中不能直接离开');

        const illegalFinish = await api(server.baseUrl, `/api/rooms/${fixture.room.code}/finish`, {
          method: 'POST',
          token: fixture.host.token,
        });
        assert.equal(illegalFinish.status, 403, '多人对局不能由客户端直接结算');

        const aborted = await endGameByVote(server.baseUrl, fixture);
        assert.equal(aborted.status, 'finished');
        assert.equal(aborted.endReason, 'aborted');
      } else {
        const finished = await finishSoloRoom(server.baseUrl, fixture);
        assert.equal(finished.status, 'finished');
        assert.equal(finished.endReason, 'finished');
      }

      const restarted = await requestRematch(server.baseUrl, fixture);
      assert.equal(restarted.status, 'playing');
      assert.equal(restarted.roundId, 2, '再来一局后 roundId 自增');

      if (multiplayer) {
        const abortedAgain = await endGameByVote(server.baseUrl, fixture);
        assert.equal(abortedAgain.status, 'finished');
      } else {
        const finishedAgain = await finishSoloRoom(server.baseUrl, fixture);
        assert.equal(finishedAgain.status, 'finished');
      }

      const waiting = expectOk(
        await backToWaiting(server.baseUrl, fixture.host.token, fixture.room.code),
        '返回等待房',
      );
      assert.equal(waiting.status, 'waiting');
      assert.equal(waiting.gameId, game.id, '返回等待房后保留游戏选择');

      for (const account of fixture.accounts) {
        const left = await leaveRoom(server.baseUrl, account.token);
        assert.equal(left.status, 200, `${account.username} 离开等待房`);
      }
      const gone = await getRoom(server.baseUrl, fixture.host.token, fixture.room.code);
      assert.equal(gone.status, 404, '所有人离开后房间销毁');
    });
  }
});

test('房间规则：成员、准备、投票超时、踢人和房主转移', async () => {
  const fixture = await prepareRoom(server.baseUrl, 'hanabi', 2, 'rule');
  const [host, guest] = fixture.accounts;
  assert.ok(host && guest);
  const code = fixture.room.code;

  const outsider = await register(server.baseUrl, 'outsider');
  const outsiderRead = await getRoom(server.baseUrl, outsider.token, code);
  assert.equal(outsiderRead.status, 403, '非成员不能读取房间');

  const guestSelect = await selectGame(server.baseUrl, guest.token, code, 'hanabi');
  assert.equal(guestSelect.status, 403, '只有房主能选择游戏');

  const early = await startRoom(server.baseUrl, host.token, code);
  assert.equal(early.status, 400, '访客未准备时房主不能开始');

  const started = await startPrepared(server.baseUrl, fixture);
  assert.equal(started.status, 'playing');

  const firstVote = expectOk(
    await endVote(server.baseUrl, host.token, code),
    '房主发起结束投票',
  );
  assert.equal(firstVote.vote?.kind, 'end');
  const rejected = expectOk(
    await castVote(server.baseUrl, guest.token, code, 'no'),
    '访客拒绝结束投票',
  );
  assert.equal(rejected.status, 'playing');
  assert.equal(rejected.vote, null, '有人拒绝后投票立即取消');

  const expiring = expectOk(await endVote(server.baseUrl, host.token, code), '再次发起投票');
  assert.ok(expiring.vote);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const expired = expectOk(await getRoom(server.baseUrl, host.token, code), '读取超时投票');
  assert.equal(expired.vote, null, '投票超时自动清除');
  assert.equal(expired.status, 'playing');

  const aborted = await endGameByVote(server.baseUrl, fixture);
  assert.equal(aborted.status, 'finished');
  assert.equal(aborted.endReason, 'aborted');

  const guestRematch = await rematchVote(server.baseUrl, guest.token, code);
  assert.equal(guestRematch.status, 403, '只有房主能发起再来一局');

  const outsiderJoin = await api(server.baseUrl, `/api/rooms/${code}/join`, {
    method: 'POST',
    token: outsider.token,
  });
  assert.equal(outsiderJoin.status, 400, '已结束的房间不能被加入');

  const back = expectOk(await backToWaiting(server.baseUrl, host.token, code), '清空结算');
  assert.equal(back.status, 'waiting');

  const kicked = expectOk(
    await kickPlayer(server.baseUrl, host.token, code, guest.userId),
    '房主移出访客',
  );
  assert.equal(kicked.playerCount, 1, '被移出的访客不在名单里');
  const guestMine = expectOk(await myRoom(server.baseUrl, guest.token), '读取访客房间');
  assert.equal(guestMine.mine, null);
  const guestRead = await getRoom(server.baseUrl, guest.token, code);
  assert.equal(guestRead.status, 403);

  await leaveRoom(server.baseUrl, host.token);

  const transfer = await prepareRoom(server.baseUrl, 'hanabi', 3, 'host');
  const [firstHost, ...rest] = transfer.accounts;
  assert.ok(firstHost && rest.length === 2);
  expectOk(await leaveRoom(server.baseUrl, firstHost.token), '原房主离开');
  const afterLeave = expectOk(
    await getRoom(server.baseUrl, rest[0]!.token, transfer.room.code),
    '读取转移后的房间',
  );
  assert.notEqual(afterLeave.hostUserId, firstHost.userId, '房主已转移');
  assert.ok(
    rest.some((account) => account.userId === afterLeave.hostUserId),
    '新房主是房间内玩家',
  );
  for (const account of rest) await leaveRoom(server.baseUrl, account.token);
});
