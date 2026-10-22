import { COLORS, type Color } from '../colors.js';
import type { ActionLog, CardView, GameView } from '../view.js';

export const MAX_HINTS = 8;
export const MAX_FUSES = 3;

const RANK_COUNTS: Record<number, number> = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 1 };

export interface Card {
  id: string;
  color: Color;
  value: number;
  hints: { color: Color | null; value: number | null };
}

export type GameResult = 'win' | 'lose' | 'score';

export interface GameState {
  deck: Card[];
  discard: Card[];
  fireworks: Record<Color, number>;
  hints: number;
  fuses: number;
  turnIndex: number;
  playerOrder: string[];
  hands: Record<string, Card[]>;
  lastActions: ActionLog[];
  phase: 'normal' | 'finalRound';
  finalTurnsLeft: number | null;
  score: number | null;
  scoreLabel?: string;
  result: GameResult | null;
}

export interface HintPayload {
  targetPlayerId: string;
  type: 'color' | 'value';
  value: Color | number;
}

export interface CardPayload {
  cardId: string;
}

export function handSizeForPlayers(count: number): number {
  return count <= 3 ? 5 : 4;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  let n = 0;
  for (const color of COLORS) {
    for (const [rank, count] of Object.entries(RANK_COUNTS)) {
      const value = Number(rank);
      for (let i = 0; i < count; i += 1) {
        n += 1;
        deck.push({ id: `c${n}`, color, value, hints: { color: null, value: null } });
      }
    }
  }
  return shuffle(deck);
}

function shuffle<T>(array: T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 2～5 人开局，按人数发 4 或 5 张牌 */
export function startGame(players: Array<{ id: string }>): GameState {
  if (players.length < 2 || players.length > 5) {
    throw new Error('人数需为 2～5 人');
  }

  const deck = createDeck();
  const size = handSizeForPlayers(players.length);
  const hands: Record<string, Card[]> = {};

  for (const p of players) {
    hands[p.id] = [];
    for (let i = 0; i < size; i += 1) {
      const card = deck.pop();
      if (!card) throw new Error('牌库不足');
      hands[p.id].push(blankHints(card));
    }
  }

  return {
    deck,
    discard: [],
    fireworks: Object.fromEntries(COLORS.map((c) => [c, 0])) as Record<Color, number>,
    hints: MAX_HINTS,
    fuses: MAX_FUSES,
    turnIndex: 0,
    playerOrder: players.map((p) => p.id),
    hands,
    lastActions: [],
    phase: 'normal',
    finalTurnsLeft: null,
    score: null,
    result: null,
  };
}

function blankHints(card: Card): Card {
  return { ...card, hints: { color: null, value: null } };
}

function currentPlayerId(game: GameState): string {
  return game.playerOrder[game.turnIndex]!;
}

function assertPlaying(game: GameState): void {
  if (game.result) throw new Error('对局已结束');
}

function drawCard(game: GameState, playerId: string): Card | null {
  if (game.deck.length === 0) return null;
  const card = blankHints(game.deck.pop()!);
  game.hands[playerId]!.push(card);
  return card;
}

function pushAction(game: GameState, action: Omit<ActionLog, 'at'>): void {
  game.lastActions = [...game.lastActions.slice(-29), { ...action, at: Date.now() }];
}

function computeScore(game: GameState): number {
  return COLORS.reduce((sum, c) => sum + game.fireworks[c], 0);
}

function scoreLabel(score: number): string {
  if (score <= 5) return 'Horrible';
  if (score <= 10) return 'Mediocre';
  if (score <= 15) return 'Honorable';
  if (score <= 20) return 'Excellent';
  if (score <= 24) return 'Amazing';
  return 'Legendary';
}

function finishGame(game: GameState, result: GameResult): void {
  game.result = result;
  game.score = computeScore(game);
  game.scoreLabel = scoreLabel(game.score);
}

function advanceTurn(game: GameState, { countFinalTurn = false } = {}): void {
  if (game.result) return;

  const allComplete = COLORS.every((c) => game.fireworks[c] === 5);
  if (allComplete) {
    finishGame(game, 'win');
    return;
  }

  if (countFinalTurn && game.phase === 'finalRound') {
    game.finalTurnsLeft = (game.finalTurnsLeft ?? 0) - 1;
    if (game.finalTurnsLeft <= 0) {
      finishGame(game, 'score');
      return;
    }
  }

  game.turnIndex = (game.turnIndex + 1) % game.playerOrder.length;
}

function afterDrawMaybeStartFinal(game: GameState, startedFinal: boolean): boolean {
  if (game.phase === 'normal' && startedFinal) {
    game.phase = 'finalRound';
    // 抽到最后一张后，每位玩家（含抽到者）再行动一轮
    game.finalTurnsLeft = game.playerOrder.length;
    return true;
  }
  return false;
}

export function giveHint(game: GameState, actorId: string, payload: HintPayload): GameState {
  assertPlaying(game);
  if (currentPlayerId(game) !== actorId) throw new Error('还没轮到你');
  if (game.hints <= 0) throw new Error('提示令牌不足');
  if (payload.targetPlayerId === actorId) throw new Error('不能提示自己');
  if (!game.playerOrder.includes(payload.targetPlayerId)) throw new Error('目标玩家不存在');

  const hand = game.hands[payload.targetPlayerId]!;
  let matchedIndexes: number[] = [];

  if (payload.type === 'color') {
    if (!COLORS.includes(payload.value as Color)) throw new Error('无效颜色');
    matchedIndexes = hand
      .map((c, i) => (c.color === payload.value ? i : -1))
      .filter((i) => i >= 0);
  } else if (payload.type === 'value') {
    const value = Number(payload.value);
    if (![1, 2, 3, 4, 5].includes(value)) throw new Error('无效数字');
    matchedIndexes = hand
      .map((c, i) => (c.value === value ? i : -1))
      .filter((i) => i >= 0);
  } else {
    throw new Error('无效提示类型');
  }

  if (matchedIndexes.length === 0) {
    throw new Error('该玩家没有匹配的牌，不能给出此提示');
  }

  for (const i of matchedIndexes) {
    if (payload.type === 'color') {
      hand[i]!.hints.color = payload.value as Color;
    } else {
      hand[i]!.hints.value = Number(payload.value);
    }
  }

  game.hints -= 1;
  pushAction(game, {
    type: 'hint',
    actorId,
    targetPlayerId: payload.targetPlayerId,
    hintType: payload.type,
    hintValue: payload.value,
    cardIndexes: matchedIndexes,
  });

  advanceTurn(game, { countFinalTurn: game.phase === 'finalRound' });
  return game;
}

export function discardCard(game: GameState, actorId: string, payload: CardPayload): GameState {
  assertPlaying(game);
  if (currentPlayerId(game) !== actorId) throw new Error('还没轮到你');
  if (game.hints >= MAX_HINTS) throw new Error('提示令牌已满，不能弃牌');

  const hand = game.hands[actorId]!;
  const idx = hand.findIndex((c) => c.id === payload.cardId);
  if (idx < 0) throw new Error('手牌中没有这张牌');

  const [card] = hand.splice(idx, 1) as [Card];
  game.discard.push(card);
  game.hints = Math.min(MAX_HINTS, game.hints + 1);

  const deckWasEmpty = game.deck.length === 0;
  const drew = drawCard(game, actorId);
  const startedFinal = !deckWasEmpty && game.deck.length === 0 && drew !== null;

  pushAction(game, {
    type: 'discard',
    actorId,
    card: { color: card.color, value: card.value },
  });

  const enteredFinal = afterDrawMaybeStartFinal(game, startedFinal);
  advanceTurn(game, { countFinalTurn: game.phase === 'finalRound' && !enteredFinal });
  return game;
}

export function playCard(game: GameState, actorId: string, payload: CardPayload): GameState {
  assertPlaying(game);
  if (currentPlayerId(game) !== actorId) throw new Error('还没轮到你');

  const hand = game.hands[actorId]!;
  const idx = hand.findIndex((c) => c.id === payload.cardId);
  if (idx < 0) throw new Error('手牌中没有这张牌');

  const [card] = hand.splice(idx, 1) as [Card];
  const expected = game.fireworks[card.color] + 1;
  const success = card.value === expected;

  if (success) {
    game.fireworks[card.color] = card.value;
    if (card.value === 5 && game.hints < MAX_HINTS) {
      game.hints += 1;
    }
  } else {
    game.discard.push(card);
    game.fuses -= 1;
    if (game.fuses <= 0) {
      pushAction(game, {
        type: 'play',
        actorId,
        card: { color: card.color, value: card.value },
        success: false,
      });
      finishGame(game, 'lose');
      return game;
    }
  }

  const deckWasEmpty = game.deck.length === 0;
  const drew = drawCard(game, actorId);
  const startedFinal = !deckWasEmpty && game.deck.length === 0 && drew !== null;

  pushAction(game, {
    type: 'play',
    actorId,
    card: { color: card.color, value: card.value },
    success,
  });

  const enteredFinal = afterDrawMaybeStartFinal(game, startedFinal);
  advanceTurn(game, { countFinalTurn: game.phase === 'finalRound' && !enteredFinal });
  return game;
}

/** 按视角过滤对局状态：本人手牌隐藏正面 */
export function viewGameForPlayer(game: GameState, viewerId: string): GameView {
  const hands: Record<string, CardView[]> = {};
  for (const pid of game.playerOrder) {
    hands[pid] = (game.hands[pid] ?? []).map((card) => {
      if (pid === viewerId) {
        return { id: card.id, hints: { ...card.hints } };
      }
      return {
        id: card.id,
        color: card.color,
        value: card.value,
        hints: { ...card.hints },
      };
    });
  }

  return {
    discard: game.discard.map((c) => ({ id: c.id, color: c.color, value: c.value })),
    fireworks: { ...game.fireworks },
    hints: game.hints,
    fuses: game.fuses,
    turnIndex: game.turnIndex,
    currentPlayerId: game.playerOrder[game.turnIndex]!,
    playerOrder: [...game.playerOrder],
    hands,
    deckCount: game.deck.length,
    lastActions: game.lastActions,
    phase: game.phase,
    finalTurnsLeft: game.finalTurnsLeft,
    score: game.score,
    scoreLabel: game.scoreLabel ?? null,
    result: game.result,
  };
}
