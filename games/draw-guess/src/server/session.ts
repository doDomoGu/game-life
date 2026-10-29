import {
  appendRecord,
  finishRoom,
  refreshStale,
  sendJson,
  type PresenceSocket,
} from '@game-life/platform-server';
import { DRAW_MS, PEN_COLORS, REVEAL_MS, ROUND_COUNT, WRONG_BUBBLE_MS, type PenColor } from '../constants.js';
import { drawGuessMeta } from '../meta.js';
import { scoreDrawer, scoreGuess } from '../scoring.js';
import type { DrawGuessView, RankView, RoundView, StrokeView } from '../view.js';
import { loadWordBank, pickWords, shufflePlayers } from '../words.js';

interface SessionPlayer {
  userId: string;
  username: string;
  connected: boolean;
  sockets: Set<PresenceSocket>;
  lastSeenAt: number;
  total: number;
  roundScore: number | null;
  correct: boolean;
  bubble: { kind: 'wrong'; text: string; until: number } | { kind: 'correct' } | null;
}

interface Session {
  code: string;
  hostUserId: string;
  players: SessionPlayer[];
  order: string[];
  words: string[];
  roundIndex: number;
  phase: 'draw' | 'reveal' | 'settlement';
  phaseEndsAt: number;
  drawerId: string;
  word: string;
  strokes: StrokeView[];
  rounds: RoundView[];
  ranking: RankView[] | null;
  startedAt: number;
  historySaved: boolean;
  closing: boolean;
  broadcastQueued: boolean;
}

const sessions = new Map<string, Session>();
const timers = new Map<string, ReturnType<typeof setInterval>>();
const bank = loadWordBank();

function fail(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

function playerOf(session: Session, userId: string): SessionPlayer | undefined {
  return session.players.find((player) => player.userId === userId);
}

function guessersOf(session: Session): SessionPlayer[] {
  return session.players.filter((player) => player.userId !== session.drawerId);
}

function remainingSec(session: Session, now = Date.now()): number {
  return Math.min(60, Math.max(1, Math.ceil((session.phaseEndsAt - now) / 1000)));
}

function resetRoundFlags(session: Session): void {
  for (const player of session.players) {
    player.roundScore = null;
    player.correct = false;
    player.bubble = null;
  }
}

function startRound(session: Session, index: number): void {
  const word = session.words[index - 1];
  const drawerId = session.order[(index - 1) % session.order.length];
  if (!word || !drawerId) fail('本局轮次无效');
  session.roundIndex = index;
  session.phase = 'draw';
  session.phaseEndsAt = Date.now() + DRAW_MS;
  session.drawerId = drawerId;
  session.word = word;
  session.strokes = [];
  resetRoundFlags(session);
}

function snapshotRound(session: Session): void {
  const scores: Record<string, number> = {};
  for (const player of session.players) scores[player.userId] = player.roundScore ?? 0;
  session.rounds.push({
    index: session.roundIndex,
    word: session.word,
    drawerId: session.drawerId,
    scores,
  });
}

function finishDraw(session: Session): void {
  if (session.phase !== 'draw') return;
  const guessers = guessersOf(session);
  const allCorrect = guessers.length > 0 && guessers.every((player) => player.correct);
  const drawer = playerOf(session, session.drawerId);
  const drawerPoints = scoreDrawer(
    guessers.map((player) => player.roundScore ?? 0),
    allCorrect,
  );
  if (drawer) {
    drawer.roundScore = drawerPoints;
    drawer.total += drawerPoints;
  }
  for (const player of guessers) {
    if (player.roundScore == null) player.roundScore = 0;
  }
  snapshotRound(session);
  session.phase = 'reveal';
  session.phaseEndsAt = Date.now() + REVEAL_MS;
}

function rankPlayers(session: Session): RankView[] {
  const sorted = [...session.players].sort(
    (a, b) => b.total - a.total || a.username.localeCompare(b.username, 'zh'),
  );
  let rank = 0;
  let previous = Number.NaN;
  return sorted.map((player, index) => {
    if (player.total !== previous) {
      rank = index + 1;
      previous = player.total;
    }
    return {
      userId: player.userId,
      username: player.username,
      score: player.total,
      rank,
    };
  });
}

async function enterSettlement(session: Session): Promise<void> {
  if (session.phase === 'settlement') return;
  session.phase = 'settlement';
  session.ranking = rankPlayers(session);
  const timer = timers.get(session.code);
  if (timer) clearInterval(timer);
  timers.delete(session.code);
  broadcast(session);
  if (session.historySaved) return;
  session.historySaved = true;
  const playedAt = new Date().toISOString();
  const durationMs = Date.now() - session.startedAt;
  const ranking = session.ranking;
  await Promise.all(
    session.players.map((player) => {
      const opponents = session.players
        .filter((other) => other.userId !== player.userId)
        .map((other) => ({ userId: other.userId, username: other.username }));
      const rank = ranking.find((item) => item.userId === player.userId)?.rank ?? session.players.length;
      return appendRecord({
        userId: player.userId,
        gameId: drawGuessMeta.id,
        rawScore: player.total,
        durationMs,
        playedAt,
        meta: {
          kind: 'draw-guess',
          roomCode: session.code,
          rank,
          opponents,
          rounds: session.rounds,
        },
      });
    }),
  );
  try {
    finishRoom(session.code, session.hostUserId);
  } catch {
    // 房间可能已经结束
  }
  broadcast(session);
}

function advance(session: Session): void {
  if (session.phase !== 'reveal') return;
  if (session.roundIndex >= ROUND_COUNT) {
    if (session.closing) return;
    session.closing = true;
    void enterSettlement(session);
    return;
  }
  startRound(session, session.roundIndex + 1);
  broadcast(session);
}

function tick(code: string): void {
  const session = sessions.get(code);
  if (!session || session.phase === 'settlement') return;
  const stale = refreshStale(session.players);
  const now = Date.now();
  if (session.phase === 'draw' && (now >= session.phaseEndsAt || allGuessersCorrect(session))) {
    finishDraw(session);
    broadcast(session);
    return;
  }
  if (session.phase === 'reveal' && now >= session.phaseEndsAt) {
    advance(session);
    return;
  }
  if (stale) broadcast(session);
}

function allGuessersCorrect(session: Session): boolean {
  const guessers = guessersOf(session);
  return guessers.length > 0 && guessers.every((player) => player.correct);
}

export function beginSession(
  code: string,
  hostUserId: string,
  players: Array<{ userId: string; username: string }>,
): void {
  const roomCode = code.toUpperCase();
  const previous = timers.get(roomCode);
  if (previous) clearInterval(previous);
  const order = shufflePlayers(players);
  const words = pickWords(bank, ROUND_COUNT);
  if (words.length < ROUND_COUNT) throw new Error('词库不足以开始一局');
  const session: Session = {
    code: roomCode,
    hostUserId,
    players: order.map((player) => ({
      userId: player.userId,
      username: player.username,
      connected: false,
      sockets: new Set(),
      lastSeenAt: 0,
      total: 0,
      roundScore: null,
      correct: false,
      bubble: null,
    })),
    order: order.map((player) => player.userId),
    words,
    roundIndex: 1,
    phase: 'draw',
    phaseEndsAt: 0,
    drawerId: '',
    word: '',
    strokes: [],
    rounds: [],
    ranking: null,
    startedAt: Date.now(),
    historySaved: false,
    closing: false,
    broadcastQueued: false,
  };
  startRound(session, 1);
  sessions.set(roomCode, session);
  timers.set(roomCode, setInterval(() => tick(roomCode), 200));
}

export function getSession(code: string): Session | undefined {
  return sessions.get(code.toUpperCase());
}

export function findMember(code: string, userId: string): SessionPlayer | undefined {
  const session = getSession(code);
  if (!session) return undefined;
  return playerOf(session, userId);
}

export function publicView(session: Session, viewerId: string): DrawGuessView {
  const showWord =
    session.phase !== 'draw' ||
    viewerId === session.drawerId ||
    playerOf(session, viewerId)?.correct === true;
  return {
    code: session.code,
    phase: session.phase,
    roundIndex: session.roundIndex,
    roundCount: ROUND_COUNT,
    endsAt: session.phaseEndsAt,
    serverNow: Date.now(),
    drawerId: session.drawerId,
    wordLength: [...session.word].length,
    word: showWord ? session.word : null,
    strokes: session.strokes,
    players: session.players.map((player) => ({
      userId: player.userId,
      username: player.username,
      connected: player.connected,
      score: player.total,
      roundScore: player.roundScore,
      correct: player.correct,
      bubble: player.bubble,
    })),
    rounds: session.phase === 'settlement' ? session.rounds : [],
    ranking: session.phase === 'settlement' ? session.ranking : null,
  };
}

function broadcast(session: Session): void {
  for (const player of session.players) {
    const payload = publicView(session, player.userId);
    for (const socket of player.sockets) sendJson(socket, 'room:update', payload);
  }
}

function broadcastSoon(session: Session): void {
  if (session.broadcastQueued) return;
  session.broadcastQueued = true;
  setTimeout(() => {
    session.broadcastQueued = false;
    if (sessions.get(session.code) === session) broadcast(session);
  }, 40);
}

/** 回合已结束时丢掉迟到的笔画。猜对会立刻收笔，画手的下一点还在路上 */
function drawingOpen(session: Session, userId: string): boolean {
  if (session.phase !== 'draw') return false;
  if (userId !== session.drawerId) fail('只有画手可以画');
  return true;
}

function pointOf(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== 'object') return null;
  const x = Number((value as { x?: unknown }).x);
  const y = Number((value as { y?: unknown }).y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

function colorOf(value: unknown): PenColor {
  const color = String(value ?? '');
  if ((PEN_COLORS as readonly string[]).includes(color)) return color as PenColor;
  return PEN_COLORS[0];
}

export function applyMessage(code: string, userId: string, message: { type?: string; payload?: unknown }): void {
  const session = getSession(code);
  if (!session) fail('对局尚未开始');
  const player = playerOf(session, userId);
  if (!player) fail('你不在该房间');
  const payload =
    message.payload && typeof message.payload === 'object' ? (message.payload as Record<string, unknown>) : {};

  if (message.type === 'stroke:start') {
    if (!drawingOpen(session, userId)) return;
    if (session.strokes.length >= 400) fail('笔画太多了');
    const id = String(payload.id ?? '');
    if (!id || session.strokes.some((stroke) => stroke.id === id)) fail('笔画无效');
    const point = pointOf(payload);
    if (!point) fail('坐标无效');
    const tool = payload.tool === 'eraser' ? 'eraser' : 'pen';
    session.strokes.push({
      id,
      tool,
      color: colorOf(payload.color),
      points: [point],
    });
    broadcastSoon(session);
    return;
  }

  if (message.type === 'stroke:point') {
    if (!drawingOpen(session, userId)) return;
    const stroke = session.strokes.find((item) => item.id === String(payload.id ?? ''));
    const point = pointOf(payload);
    if (!stroke || !point) return;
    if (stroke.points.length >= 800) return;
    stroke.points.push(point);
    broadcastSoon(session);
    return;
  }

  if (message.type === 'undo') {
    if (!drawingOpen(session, userId)) return;
    session.strokes.pop();
    broadcast(session);
    return;
  }

  if (message.type === 'clear') {
    if (!drawingOpen(session, userId)) return;
    session.strokes = [];
    broadcast(session);
    return;
  }

  if (message.type === 'guess') {
    if (session.phase !== 'draw') return;
    if (userId === session.drawerId) fail('画手不能猜');
    if (player.correct) fail('你已经猜对了');
    const text = String(payload.text ?? '').trim();
    if (![...text].length || [...text].length !== [...session.word].length) fail('字数不对');
    if (![...text].every((char) => /[\u4e00-\u9fff]/.test(char))) fail('请输入汉字');
    if (text === session.word) {
      const points = scoreGuess(remainingSec(session));
      player.correct = true;
      player.roundScore = points;
      player.total += points;
      player.bubble = { kind: 'correct' };
      if (allGuessersCorrect(session)) finishDraw(session);
      broadcast(session);
      return;
    }
    player.bubble = { kind: 'wrong', text, until: Date.now() + WRONG_BUBBLE_MS };
    broadcast(session);
    return;
  }

  fail('未知操作');
}

export function broadcastSession(code: string): void {
  const session = getSession(code);
  if (session) broadcast(session);
}
