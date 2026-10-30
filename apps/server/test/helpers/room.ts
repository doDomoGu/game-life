import assert from 'node:assert/strict';
import {
  castVote,
  createRoom,
  endVote,
  expectOk,
  finishRoom,
  getRoom,
  joinRoom,
  register,
  rematchVote,
  selectGame,
  setReady,
  startRoom,
  type Account,
  type RoomView,
} from './api.js';

export interface RoomFixture {
  accounts: Account[];
  host: Account;
  room: RoomView;
}

export async function newAccounts(
  base: string,
  prefix: string,
  count: number,
): Promise<Account[]> {
  // 文件存储的注册是读改写，串行注册避免并发写丢用户
  const accounts: Account[] = [];
  for (let index = 0; index < count; index += 1) {
    accounts.push(await register(base, prefix));
  }
  return accounts;
}

/** 建房 + 其他人加入 + 房主选好游戏，停在等待准备的状态 */
export async function prepareRoom(
  base: string,
  gameId: string,
  count: number,
  prefix = 'p',
): Promise<RoomFixture> {
  const accounts = await newAccounts(base, prefix, count);
  const [host, ...guests] = accounts;
  assert.ok(host, '至少需要一个房主');
  let room = await createRoom(base, host.token);
  for (const guest of guests) {
    room = await joinRoom(base, guest.token, room.code);
  }
  room = expectOk(
    await selectGame(base, host.token, room.code, gameId),
    `房主选择 ${gameId}`,
  );
  assert.equal(room.status, 'waiting');
  assert.equal(room.gameId, gameId);
  assert.equal(room.playerCount, count);
  return { accounts, host, room };
}

export async function readyGuests(base: string, fixture: RoomFixture): Promise<void> {
  const guests = fixture.accounts.filter((account) => account.userId !== fixture.host.userId);
  for (const guest of guests) {
    const room = await setReady(base, guest.token, fixture.room.code, true);
    assert.equal(room.players.find((p) => p.userId === guest.userId)?.ready, true);
  }
}

/** 全员准备并由房主开始；返回开始后的房间 */
export async function startPrepared(base: string, fixture: RoomFixture): Promise<RoomView> {
  await readyGuests(base, fixture);
  const started = expectOk(
    await startRoom(base, fixture.host.token, fixture.room.code),
    '房主开始游戏',
  );
  assert.equal(started.status, 'playing');
  return started;
}

/** 所有其他玩家同意结束投票 */
export async function endGameByVote(
  base: string,
  fixture: RoomFixture,
): Promise<RoomView> {
  const { room, accounts } = fixture;
  // 刷新在线标记，避免测试执行较慢时有人被判定为掉线而少一票
  for (const account of accounts) {
    expectOk(await getRoom(base, account.token, room.code), '刷新房间在线状态');
  }
  const initiator = accounts[0]!;
  const voteRoom = expectOk(
    await endVote(base, initiator.token, room.code),
    '发起结束投票',
  );
  let current = voteRoom;
  for (const account of accounts.slice(1)) {
    current = expectOk(
      await castVote(base, account.token, room.code, 'yes'),
      `${account.username} 同意结束`,
    );
  }
  return current;
}

/** 单人房间直接结算 */
export async function finishSoloRoom(
  base: string,
  fixture: RoomFixture,
): Promise<RoomView> {
  return expectOk(
    await finishRoom(base, fixture.host.token, fixture.room.code),
    '单人房结算',
  );
}

export async function requestRematch(
  base: string,
  fixture: RoomFixture,
): Promise<RoomView> {
  const voteRoom = expectOk(
    await rematchVote(base, fixture.host.token, fixture.room.code),
    '发起再来一局',
  );
  let current = voteRoom;
  for (const account of fixture.accounts.slice(1)) {
    current = expectOk(
      await castVote(base, account.token, fixture.room.code, 'yes'),
      `${account.username} 同意再来一局`,
    );
  }
  return current;
}
