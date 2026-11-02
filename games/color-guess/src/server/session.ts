import {
  appendRecord,
  markRoomsDirty,
  reportGameOver,
} from '@game-life/platform-server';
import { colorGuessMeta } from '../meta.js';
import {
  CODE_LENGTH,
  MAX_ATTEMPTS,
  RACE_ATTEMPTS_PER_PLAYER,
  randomSecret,
  scoreGuess,
  validateCode,
} from '../engine.js';
import type {
  AttemptView,
  ColorGuessConfig,
  ColorGuessMode,
  ColorGuessResult,
  ColorGuessRole,
  ColorGuessView,
} from '../view.js';

interface SessionPlayer {
  userId: string;
  username: string;
  role: 'host' | 'guest';
}

interface Board {
  attempts: AttemptView[];
  solved: boolean;
}

interface Session {
  code: string;
  hostUserId: string;
  players: SessionPlayer[];
  phase: 'setup' | 'setter' | 'guessing' | 'finished';
  config: ColorGuessConfig;
  secret: number[] | null;
  setterId: string | null;
  guesserId: string | null;
  turnUserId: string | null;
  boards: Record<string, Board>;
  winnerId: string | null;
  result: ColorGuessResult;
  startedAt: number;
  historySaved: boolean;
}

const sessions = new Map<string, Session>();

function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}

function defaultConfig(playerCount: number): ColorGuessConfig {
  return {
    mode: playerCount === 1 ? 'solo' : 'race',
    paletteSize: 8,
    allowDuplicates: false,
    setterChoice: 'random',
  };
}

function emptyBoards(players: SessionPlayer[]): Record<string, Board> {
  return Object.fromEntries(players.map((player) => [player.userId, { attempts: [], solved: false }]));
}

function boardOf(session: Session, userId: string): Board {
  const board = session.boards[userId];
  if (!board) fail('你不在本局中', 403);
  return board;
}

function playerOf(session: Session, userId: string): SessionPlayer | undefined {
  return session.players.find((player) => player.userId === userId);
}

function otherPlayer(session: Session, userId: string): SessionPlayer | undefined {
  return session.players.find((player) => player.userId !== userId);
}

export function beginSession(
  code: string,
  hostUserId: string,
  players: Array<{ userId: string; username: string; role: 'host' | 'guest' }>,
): void {
  if (players.length < 1 || players.length > 2) {
    fail('猜颜色支持 1～2 人', 400);
  }
  const roomCode = code.toUpperCase();
  sessions.set(roomCode, {
    code: roomCode,
    hostUserId,
    players: players.map((player) => ({ ...player })),
    phase: 'setup',
    config: defaultConfig(players.length),
    secret: null,
    setterId: null,
    guesserId: null,
    turnUserId: null,
    boards: emptyBoards(players),
    winnerId: null,
    result: null,
    startedAt: 0,
    historySaved: false,
  });
  markRoomsDirty();
}

export function getSession(code: string): Session | undefined {
  return sessions.get(code.toUpperCase());
}

export function abortSession(code: string): void {
  sessions.delete(code.toUpperCase());
}

export function snapshotRoom(code: string): unknown {
  return getSession(code) ?? null;
}

export function restoreRoom(code: string, snapshot: unknown): void {
  const data = snapshot as Session | null;
  if (!data || !Array.isArray(data.players) || !data.config || !data.boards) return;
  sessions.set(code.toUpperCase(), {
    ...data,
    code: code.toUpperCase(),
  });
}

function youRole(session: Session, viewerId: string): ColorGuessRole {
  if (session.config.mode === 'solo') return 'solo';
  if (session.config.mode === 'setter') {
    if (viewerId === session.setterId) return 'setter';
    if (viewerId === session.guesserId) return 'guesser';
    return 'spectator';
  }
  return playerOf(session, viewerId) ? 'guesser' : 'spectator';
}

export function publicView(session: Session, viewerId: string): ColorGuessView {
  const canSeeSecret =
    session.phase === 'finished' || (!!session.setterId && viewerId === session.setterId);
  return {
    code: session.code,
    hostUserId: session.hostUserId,
    players: session.players.map((player) => ({ ...player })),
    phase: session.phase,
    config: { ...session.config },
    secret: canSeeSecret ? (session.secret ? [...session.secret] : null) : null,
    setterId: session.setterId,
    guesserId: session.guesserId,
    turnUserId: session.turnUserId,
    boards: Object.fromEntries(
      session.players.map((player) => {
        const board = session.boards[player.userId]!;
        return [
          player.userId,
          {
            userId: player.userId,
            username: player.username,
            attempts: board.attempts.map((attempt) => ({
              ...attempt,
              colors: [...attempt.colors],
            })),
            solved: board.solved,
          },
        ];
      }),
    ),
    winnerId: session.winnerId,
    result: session.result,
    maxAttempts: MAX_ATTEMPTS,
    attemptLimit:
      session.config.mode === 'race' ? RACE_ATTEMPTS_PER_PLAYER : MAX_ATTEMPTS,
    canConfig: viewerId === session.hostUserId && session.phase === 'setup',
    youRole: youRole(session, viewerId),
  };
}

function assertHost(session: Session, userId: string): void {
  if (session.hostUserId !== userId) fail('仅房主可以操作', 403);
}

function assertPlayer(session: Session, userId: string): void {
  if (!playerOf(session, userId)) fail('你不在本局中', 403);
}

function setterForStart(session: Session): string {
  if (session.players.length !== 2) fail('出题模式需要两名玩家', 400);
  if (session.config.setterChoice === 'random') {
    return session.players[Math.floor(Math.random() * session.players.length)]!.userId;
  }
  if (!session.players.some((player) => player.userId === session.config.setterChoice)) {
    fail('指定的出题者不在房间中');
  }
  return session.config.setterChoice;
}

export function updateConfig(
  code: string,
  userId: string,
  patch: Partial<ColorGuessConfig>,
): Session {
  const session = getSession(code);
  if (!session) fail('对局未开始', 404);
  assertHost(session, userId);
  if (session.phase !== 'setup') fail('对局已经开始，不能再改配置');

  if (patch.mode !== undefined) {
    const mode = patch.mode as ColorGuessMode;
    if (!['solo', 'race', 'setter'].includes(mode)) fail('未知玩法');
    if (session.players.length === 1 && mode !== 'solo') fail('单人游玩只能选择单人模式');
    if (session.players.length === 2 && mode === 'solo') fail('双人游玩请选择竞速或出题模式');
    session.config.mode = mode;
  }
  if (patch.paletteSize !== undefined) {
    if (patch.paletteSize !== 8 && patch.paletteSize !== 10) fail('颜色数量只能是 8 或 10');
    session.config.paletteSize = patch.paletteSize;
  }
  if (patch.allowDuplicates !== undefined) {
    session.config.allowDuplicates = patch.allowDuplicates === true;
  }
  if (patch.setterChoice !== undefined) {
    const choice = String(patch.setterChoice);
    if (choice !== 'random' && !session.players.some((player) => player.userId === choice)) {
      fail('出题者不在房间中');
    }
    session.config.setterChoice = choice;
  }
  if (session.config.mode !== 'setter') session.config.setterChoice = 'random';
  if (session.players.length === 1) session.config.mode = 'solo';
  markRoomsDirty();
  return session;
}

export function startSession(code: string, userId: string): Session {
  const session = getSession(code);
  if (!session) fail('对局未开始', 404);
  assertHost(session, userId);
  if (session.phase !== 'setup') fail('当前不能开始');
  if (session.players.length === 1) {
    session.config.mode = 'solo';
    session.config.setterChoice = 'random';
  } else if (session.config.mode === 'solo') {
    fail('双人游玩请选择竞速或出题模式');
  }

  session.boards = emptyBoards(session.players);
  session.winnerId = null;
  session.result = null;
  session.startedAt = Date.now();
  session.historySaved = false;

  if (session.config.mode === 'setter') {
    session.setterId = setterForStart(session);
    session.guesserId =
      session.players.find((player) => player.userId !== session.setterId)?.userId ?? null;
    session.secret = null;
    session.phase = 'setter';
    session.turnUserId = null;
  } else {
    session.secret = randomSecret(session.config.paletteSize, session.config.allowDuplicates);
    session.setterId = null;
    session.guesserId = null;
    session.phase = 'guessing';
    session.turnUserId = session.players[0]!.userId;
  }
  markRoomsDirty();
  return session;
}

export function submitSecret(code: string, userId: string, colors: unknown): Session {
  const session = getSession(code);
  if (!session) fail('对局未开始', 404);
  if (session.phase !== 'setter') fail('现在不需要出题');
  if (session.setterId !== userId) fail('只有出题者可以设置密码', 403);
  const error = validateCode(colors, session.config.paletteSize, session.config.allowDuplicates);
  if (error) fail(error);
  session.secret = (colors as number[]).slice();
  session.phase = 'guessing';
  session.turnUserId = session.guesserId;
  markRoomsDirty();
  return session;
}

async function finish(
  session: Session,
  winnerId: string | null,
  result: Exclude<ColorGuessResult, null>,
): Promise<void> {
  if (session.phase === 'finished') return;
  session.phase = 'finished';
  session.winnerId = winnerId;
  session.result = result;
  session.turnUserId = null;
  markRoomsDirty();

  if (!session.historySaved) {
    session.historySaved = true;
    const playedAt = new Date().toISOString();
    const durationMs = session.startedAt ? Date.now() - session.startedAt : 0;
    await Promise.all(
      session.players.map((player) => {
        const board = session.boards[player.userId]!;
        return appendRecord({
          userId: player.userId,
          gameId: colorGuessMeta.id,
          rawScore: board.attempts.length,
          durationMs,
          playedAt,
          meta: {
            kind: 'color-guess',
            roomCode: session.code,
            mode: session.config.mode,
            won: result !== 'draw' && winnerId === player.userId,
            result,
            attempts: board.attempts.length,
            paletteSize: session.config.paletteSize,
            allowDuplicates: session.config.allowDuplicates,
          },
        });
      }),
    );
    try {
      reportGameOver(session.code, session.hostUserId);
    } catch {
      // 房间可能已经被结束，记录写入即可
    }
  }
  markRoomsDirty();
}

export async function submitGuess(
  code: string,
  userId: string,
  colors: unknown,
): Promise<Session> {
  const session = getSession(code);
  if (!session) fail('对局未开始', 404);
  if (session.phase !== 'guessing') fail('现在不能猜');
  const currentId =
    session.config.mode === 'setter' ? session.guesserId : session.turnUserId;
  if (currentId !== userId) fail('还没轮到你猜', 403);
  const board = boardOf(session, userId);
  const attemptLimit =
    session.config.mode === 'race' ? RACE_ATTEMPTS_PER_PLAYER : MAX_ATTEMPTS;
  if (board.attempts.length >= attemptLimit) fail('你的猜测次数已用完');

  const error = validateCode(colors, session.config.paletteSize, session.config.allowDuplicates);
  if (error) fail(error);
  const guess = (colors as number[]).slice();
  const feedback = scoreGuess(session.secret ?? [], guess);
  board.attempts.push({ colors: guess, ...feedback });

  if (feedback.exact === CODE_LENGTH) {
    board.solved = true;
    await finish(session, userId, 'win');
    return session;
  }

  if (session.config.mode === 'race') {
    const total = session.players.reduce(
      (sum, player) => sum + (session.boards[player.userId]?.attempts.length ?? 0),
      0,
    );
    if (total >= MAX_ATTEMPTS) {
      await finish(session, null, 'draw');
      return session;
    }
    const other = otherPlayer(session, userId);
    const otherBoard = other ? session.boards[other.userId]! : undefined;
    if (other && otherBoard && otherBoard.attempts.length < RACE_ATTEMPTS_PER_PLAYER) {
      session.turnUserId = other.userId;
    }
    markRoomsDirty();
    return session;
  }

  if (board.attempts.length >= MAX_ATTEMPTS) {
    if (session.config.mode === 'solo') {
      await finish(session, null, 'lose');
      return session;
    }
    await finish(session, session.setterId, 'win');
    return session;
  }

  markRoomsDirty();
  return session;
}

export async function applyAction(
  code: string,
  userId: string,
  message: { type?: string; payload?: Record<string, unknown> },
): Promise<Session> {
  const session = getSession(code);
  if (!session) fail('对局未开始', 404);
  assertPlayer(session, userId);
  const payload = message.payload ?? {};
  switch (message.type) {
    case 'action:config':
      return updateConfig(code, userId, {
        mode: payload.mode as ColorGuessMode | undefined,
        paletteSize: payload.paletteSize as 8 | 10 | undefined,
        allowDuplicates:
          payload.allowDuplicates === undefined ? undefined : payload.allowDuplicates === true,
        setterChoice:
          payload.setterChoice === undefined ? undefined : String(payload.setterChoice),
      });
    case 'action:start':
      return startSession(code, userId);
    case 'action:secret':
      return submitSecret(code, userId, payload.colors);
    case 'action:guess':
      return submitGuess(code, userId, payload.colors);
    default:
      fail('未知操作');
  }
}
