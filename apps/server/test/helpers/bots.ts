import assert from 'node:assert/strict';
import {
  api,
  expectOk,
  getRoom,
  waitForRoom,
  type ApiResponse,
} from './api.js';
import type { RoomFixture } from './room.js';

interface BingoView {
  status: 'playing' | 'finished';
  winner: { userId: string; username: string } | null;
}

interface HanabiCard {
  id: string;
  color?: string;
  value?: number;
}

interface HanabiView {
  game: {
    currentPlayerId: string;
    hands: Record<string, HanabiCard[]>;
    result: string | null;
  };
}

interface MahjongView {
  game: {
    phase: 'playing' | 'settling' | 'handEnd' | 'finished';
  };
}

async function action<T = unknown>(
  base: string,
  gameId: string,
  code: string,
  token: string,
  body: unknown,
): Promise<ApiResponse<T>> {
  return api<T>(base, `/api/games/${gameId}/rooms/${code}/action`, {
    method: 'POST',
    token,
    body,
  });
}

/** Bingo：房主连续开奖直到有人连线 */
export async function playBingo(base: string, fixture: RoomFixture): Promise<void> {
  const code = fixture.room.code;
  for (let draw = 0; draw < 60; draw += 1) {
    const response = await api<BingoView>(base, `/api/games/bingo/rooms/${code}/draw`, {
      method: 'POST',
      token: fixture.host.token,
    });
    const view = expectOk(response, `Bingo 第 ${draw + 1} 次开奖`);
    if (view.status === 'finished') {
      assert.ok(view.winner, 'Bingo 结束时应有获胜者');
      return;
    }
  }
  throw new Error('Bingo 60 次开奖后仍未结束');
}

/** 花火：每个回合让当前玩家打出第一张手牌，直到牌库耗尽或失误三次 */
export async function playHanabi(base: string, fixture: RoomFixture): Promise<void> {
  const code = fixture.room.code;
  const path = `/api/games/hanabi/rooms/${code}`;
  for (let turn = 0; turn < 300; turn += 1) {
    const room = expectOk(await getRoom(base, fixture.host.token, code), '读取花火房间');
    if (room.status === 'finished') return;

    const anyView = await api<HanabiView>(base, path, { token: fixture.host.token });
    if (anyView.status !== 200) return;
    const currentId = anyView.data.game.currentPlayerId;
    const actor = fixture.accounts.find((account) => account.userId === currentId);
    if (!actor) throw new Error('当前行动玩家不在测试账号里');

    const ownView = await api<HanabiView>(base, path, { token: actor.token });
    if (ownView.status !== 200) return;
    const hand = ownView.data.game.hands[currentId] ?? [];
    const card = hand.find((item) => item.color) ?? hand[0];
    if (!card) return;

    const play = await action<HanabiView>(base, 'hanabi', code, actor.token, {
      type: 'action:play',
      payload: { cardId: card.id },
    });
    if (play.status === 400) {
      const now = expectOk(await getRoom(base, fixture.host.token, code), '读取花火房间');
      if (now.status === 'finished') return;
      throw new Error(`花火出牌失败：${JSON.stringify(play.data)}`);
    }
    const view = expectOk<HanabiView>(play, '花火出牌');
    if (view.game.result) return;
  }
  throw new Error('花火 300 回合后仍未结束');
}

/** 麻将：流局结算四家各 0 分，然后结束整场对局 */
export async function playMahjong(base: string, fixture: RoomFixture): Promise<void> {
  const code = fixture.room.code;
  const path = `/api/games/mahjong-wind/rooms/${code}`;

  expectOk(
    await action(base, 'mahjong-wind', code, fixture.host.token, {
      type: 'action:settle-start',
      payload: { kind: 'draw', dealerFlag: false },
    }),
    '麻将发起流局结算',
  );
  for (const account of fixture.accounts) {
    expectOk(
      await action(base, 'mahjong-wind', code, account.token, {
        type: 'action:settle-submit',
        payload: { value: 0 },
      }),
      `${account.username} 提交 0 点`,
    );
  }

  const beforeEnd = await api<MahjongView>(base, path, { token: fixture.host.token });
  const view = expectOk(beforeEnd, '读取麻将结算状态');
  assert.equal(view.game.phase, 'handEnd', '四家提交后进入本局结束');

  expectOk(
    await action(base, 'mahjong-wind', code, fixture.host.token, {
      type: 'action:end-match',
    }),
    '麻将结束整场对局',
  );
}

/** 你画我猜没有 HTTP 动作入口，靠缩短的单轮时长让服务端计时器跑完整局 */
export async function playDrawGuess(base: string, fixture: RoomFixture): Promise<void> {
  await waitForRoom(
    base,
    fixture.host.token,
    fixture.room.code,
    (room) => room.status === 'finished',
    '你画我猜自然结束',
    15_000,
  );
}
