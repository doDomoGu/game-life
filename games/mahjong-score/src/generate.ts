import { calculateFu } from './fu.js';
import { calculatePoints } from './points.js';
import { buildWinTiles, collectHandTiles } from './structure.js';
import { countTile, nextDoraTile, tileGroupsToHand13 } from './tiles.js';
import type { HandFacts, Question, Suit, WaitType, WinType } from './types.js';
import { computeYakuFromFacts, randomTiles, yakuHanTotal } from './yaku.js';

const SUITS: Suit[] = ['m', 'p', 's'];

export interface GenerateOptions {
  dealer: boolean;
  winType: WinType;
  honba: number;
  riichi: boolean;
  ippatsu: boolean;
}

function pickSuit(): Suit {
  return SUITS[Math.floor(Math.random() * SUITS.length)]!;
}

function seq(start: number, suit: Suit) {
  return `${start}${start + 1}${start + 2}${suit}`;
}

function pairTile(pair: string) {
  return `${pair[0]}${pair.slice(-1)}`;
}

function inferWaitType(winTile: string, pair: string, mentsu: string[]): WaitType {
  if (winTile === pairTile(pair)) return '单骑听牌';
  const winShun = mentsu.find((group) => {
    if (!/^[1-9]{3}[mps]$/.test(group)) return false;
    const match = group.match(/^([1-9])([1-9])([1-9])([mps])$/);
    if (!match) return false;
    return [`${match[1]}${match[4]}`, `${match[2]}${match[4]}`, `${match[3]}${match[4]}`].includes(winTile);
  });
  if (winShun) {
    const match = winShun.match(/^([1-9])([1-9])([1-9])([mps])$/);
    if (!match) return '边张';
    return `${match[2]}${match[4]}` === winTile ? '坎张' : '边张';
  }
  return '边张';
}

function factsFrom(
  mentsu: string[],
  pair: string,
  options: GenerateOptions,
  waitType: WaitType,
  winTile: string | null,
): HandFacts | null {
  if (!winTile) return null;
  return {
    groups: mentsu,
    pair,
    hands: tileGroupsToHand13(mentsu, pair),
    openMelds: [],
    concealedKans: [],
    winTile,
    winType: options.winType,
    waitType,
    riichi: options.riichi,
    ippatsu: options.ippatsu,
    honba: options.honba,
    dealer: options.dealer,
    doraIndicators: [],
    uraDoraIndicators: [],
    redDoraCount: 0,
  };
}

function handWinTile(mentsu: string[], pair: string, filter?: (tile: string) => boolean) {
  const winTiles = buildWinTiles({ groups: mentsu, openMelds: [], concealedKans: [], pair });
  const tiles = collectHandTiles(winTiles);
  const pool = filter ? tiles.filter(filter) : tiles;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export function generateFactsForPinfu(options: GenerateOptions): HandFacts | null {
  const suit = pickSuit();
  const mentsu = [seq(1, suit), seq(4, suit), seq(7, suit)];
  const fourth = [seq(2, suit), seq(3, suit), seq(6, suit)][Math.floor(Math.random() * 3)]!;
  mentsu.push(fourth);
  const pairVal = [2, 3, 4, 5, 6, 7, 8][Math.floor(Math.random() * 7)]!;
  const pair = `${pairVal}${pairVal}${suit}`;
  const middles = new Set(
    mentsu.map((group) => {
      const match = group.match(/^([1-9])([1-9])([1-9])([mps])$/);
      return match ? `${match[2]}${match[4]}` : '';
    }),
  );
  const winTile = handWinTile(mentsu, pair, (tile) => !middles.has(tile));
  return factsFrom(mentsu, pair, options, '两面听', winTile);
}

export function generateFactsForTanyao(options: GenerateOptions): HandFacts | null {
  const suit = pickSuit();
  const pool = [seq(2, suit), seq(3, suit), seq(4, suit), seq(5, suit), seq(6, suit)];
  const mentsu = Array.from({ length: 4 }, () => pool[Math.floor(Math.random() * pool.length)]!);
  const pairVal = [2, 3, 4, 5, 6, 7, 8][Math.floor(Math.random() * 7)]!;
  const pair = `${pairVal}${pairVal}${suit}`;
  const winTile = handWinTile(mentsu, pair);
  return factsFrom(mentsu, pair, options, inferWaitType(winTile ?? '', pair, mentsu), winTile);
}

export function generateFactsForIttsu(options: GenerateOptions): HandFacts | null {
  const suit = pickSuit();
  const mentsuBase = [seq(1, suit), seq(4, suit), seq(7, suit)];
  let fourth: string;
  if (Math.random() < 0.5) {
    const other = pickSuit();
    const start = 1 + Math.floor(Math.random() * 7);
    fourth = seq(start, other);
  } else if (Math.random() < 0.25) {
    const value = 1 + Math.floor(Math.random() * 7);
    fourth = `${value}${value}${value}z`;
  } else {
    const other = pickSuit();
    const value = 1 + Math.floor(Math.random() * 9);
    fourth = `${value}${value}${value}${other}`;
  }
  const mentsu = [...mentsuBase, fourth];
  let pair: string;
  if (Math.random() < 0.25) {
    const value = 1 + Math.floor(Math.random() * 7);
    pair = `${value}${value}z`;
  } else {
    const other = pickSuit();
    const value = 1 + Math.floor(Math.random() * 9);
    pair = `${value}${value}${other}`;
  }
  const winTile = handWinTile(mentsu, pair);
  return factsFrom(mentsu, pair, options, inferWaitType(winTile ?? '', pair, mentsu), winTile);
}

export function generateFactsForYakuhai(options: GenerateOptions): HandFacts | null {
  const value = [5, 6, 7][Math.floor(Math.random() * 3)]!;
  const yakuhaiTriplet = `${value}${value}${value}z`;
  const suit = pickSuit();
  const tripVal = 2 + Math.floor(Math.random() * 7);
  const randomMeld = () =>
    Math.random() < 0.6
      ? seq(1 + Math.floor(Math.random() * 7), suit)
      : `${tripVal}${tripVal}${tripVal}${suit}`;
  const mentsu = [yakuhaiTriplet, randomMeld(), randomMeld(), randomMeld()];
  let pair: string;
  if (Math.random() < 0.15) {
    const pairVal = 1 + Math.floor(Math.random() * 7);
    pair = `${pairVal}${pairVal}z`;
  } else {
    const pairVal = 1 + Math.floor(Math.random() * 9);
    pair = `${pairVal}${pairVal}${suit}`;
  }
  const winTile = handWinTile(mentsu, pair);
  return factsFrom(mentsu, pair, options, inferWaitType(winTile ?? '', pair, mentsu), winTile);
}

function finalizeQuestion(facts: HandFacts): Question | null {
  const yaku = computeYakuFromFacts(facts);
  if (facts.riichi) yaku.push('立直');
  if (facts.ippatsu) yaku.push('一发');
  if (facts.openMelds.length === 0 && facts.winType === 'tsumo') yaku.push('门清自摸');

  const doraIndicators = randomTiles(1);
  const uraDoraIndicators = facts.riichi ? randomTiles(doraIndicators.length) : [];
  const tileGroups = [...facts.groups, facts.pair];
  const redDoraCount = Math.min(
    Math.floor(Math.random() * 3),
    countTile(tileGroups, '5m') + countTile(tileGroups, '5p') + countTile(tileGroups, '5s'),
  );
  const doraCount =
    [...doraIndicators, ...uraDoraIndicators].reduce(
      (total, indicator) => total + countTile(tileGroups, nextDoraTile(indicator)),
      0,
    ) + redDoraCount;

  if (doraCount > 0) yaku.push(`宝牌×${doraCount}`);
  if (redDoraCount > 0) yaku.push('赤宝牌');

  const question: Question = {
    ...facts,
    doraIndicators,
    uraDoraIndicators,
    redDoraCount,
    doraCount,
    yaku,
    han: yakuHanTotal(yaku, facts.openMelds.length > 0) + doraCount,
    fu: 0,
    fuDetails: [],
    answer: { base: 0, limitLabel: '' },
  };

  const fuResult = calculateFu(question, buildWinTiles(question));
  question.fu = fuResult.fu;
  question.fuDetails = fuResult.fuDetails;
  question.answer = calculatePoints(question);

  const winTiles = buildWinTiles(question);
  const counts = new Map<string, number>();
  for (const element of winTiles) {
    for (const tile of element.tiles) counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  for (const count of counts.values()) {
    if (count > 4) return null;
  }
  if (!winTiles.some((element) => element.tiles.includes(question.winTile))) return null;
  return question;
}

export function randomQuestion(includeHonba = true): Question {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const dealer = Math.random() < 0.25;
    const winType: WinType = Math.random() < 0.5 ? 'ron' : 'tsumo';
    const honba = includeHonba ? Math.floor(Math.random() * 4) : 0;
    const riichi = Math.random() < 0.8;
    const ippatsu = riichi && Math.random() < 0.35;
    const options: GenerateOptions = { dealer, winType, honba, riichi, ippatsu };
    const roll = Math.random();
    const facts =
      roll < 0.27
        ? generateFactsForPinfu(options)
        : roll < 0.54
          ? generateFactsForTanyao(options)
          : roll < 0.81
            ? generateFactsForIttsu(options)
            : generateFactsForYakuhai(options);
    if (!facts) continue;
    const question = finalizeQuestion(facts);
    if (question) return question;
  }
  throw new Error('未能生成合法题目');
}

export function generateRound(count: number, includeHonba = true): Question[] {
  return Array.from({ length: count }, () => randomQuestion(includeHonba));
}
