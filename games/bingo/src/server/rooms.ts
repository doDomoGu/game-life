import { appendRecord, finishRoom } from '@game-life/platform-server';
import { applyDraw, checkWin, createDrawPool, createRandomBoard } from './engine.js';
import { BINGO_ITEM_COUNT } from '../items.js';
import { bingoMeta } from '../meta.js';

export type PlayerRole = 'host' | 'guest';

export interface RoomPlayer {
  userId: string;
  username: string;
  role: PlayerRole;
  board: number[];
  marked: boolean[];
}

export interface BingoSession {
  code: string;
  hostUserId: string;
  players: RoomPlayer[];
  drawPool: number[];
  drawnItemIds: number[];
  currentItemId: number | null;
  winnerUserId: string | null;
  winnerUsername: string | null;
  historySaved: boolean;
  finished: boolean;
}

const sessions = new Map<string, BingoSession>();

export function beginSession(
  code: string,
  players: Array<{ userId: string; username: string; role: PlayerRole }>,
) {
  const host = players.find((p) => p.role === 'host') ?? players[0];
  if (!host) {
    throw Object.assign(new Error('房间没有玩家'), { statusCode: 400 });
  }
  sessions.set(code.toUpperCase(), {
    code: code.toUpperCase(),
    hostUserId: host.userId,
    players: players.map((p) => ({
      ...p,
      board: createRandomBoard(),
      marked: Array(BINGO_ITEM_COUNT).fill(false),
    })),
    drawPool: createDrawPool(),
    drawnItemIds: [],
    currentItemId: null,
    winnerUserId: null,
    winnerUsername: null,
    historySaved: false,
    finished: false,
  });
}

function findSession(code: string): BingoSession | undefined {
  return sessions.get(code.toUpperCase());
}

async function saveMatchHistory(session: BingoSession) {
  const playedAt = new Date().toISOString();
  await Promise.all(
    session.players.map((player) => {
      const opponents = session.players
        .filter((other) => other.userId !== player.userId)
        .map((other) => ({ userId: other.userId, username: other.username }));
      const won = player.userId === session.winnerUserId;
      return appendRecord({
        userId: player.userId,
        gameId: bingoMeta.id,
        rawScore: won ? 1 : 0,
        playedAt,
        meta: {
          kind: 'bingo',
          roomCode: session.code,
          won,
          opponents,
        },
      });
    }),
  );
}

export async function drawNext(code: string, hostUserId: string): Promise<BingoSession> {
  const session = findSession(code);
  if (!session) throw Object.assign(new Error('对局不存在'), { statusCode: 404 });
  if (session.hostUserId !== hostUserId) {
    throw Object.assign(new Error('仅房主可以开奖'), { statusCode: 403 });
  }
  if (session.finished) {
    throw Object.assign(new Error('已有获胜者'), { statusCode: 400 });
  }
  if (session.drawPool.length === 0) {
    throw Object.assign(new Error('所有图案已揭晓'), { statusCode: 400 });
  }
  const itemId = session.drawPool.shift()!;
  session.currentItemId = itemId;
  session.drawnItemIds.push(itemId);

  for (const player of session.players) {
    player.marked = applyDraw(player.board, player.marked, itemId);
    if (!session.winnerUserId && checkWin(player.marked)) {
      session.winnerUserId = player.userId;
      session.winnerUsername = player.username;
      session.finished = true;
    }
  }
  if (session.finished && !session.historySaved) {
    await saveMatchHistory(session);
    session.historySaved = true;
    finishRoom(session.code, hostUserId);
  }
  return session;
}

export function getSession(code: string): BingoSession | undefined {
  return findSession(code);
}
