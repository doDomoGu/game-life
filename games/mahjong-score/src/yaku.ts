import type { HandFacts } from './types.js';
import { YAKU_OPTIONS } from './types.js';

const DORA_TILE_POOL = [
  '1m', '4m', '7m', '9m',
  '1p', '4p', '7p', '9p',
  '1s', '4s', '7s', '9s',
  '1z', '2z', '3z', '5z',
];

export function randomTiles(count: number): string[] {
  return Array.from({ length: count }, () => DORA_TILE_POOL[Math.floor(Math.random() * DORA_TILE_POOL.length)]!);
}

function allTilesFromQuestion(question: HandFacts): string[] {
  return [
    ...question.groups,
    ...question.openMelds,
    ...question.concealedKans,
    question.pair,
    question.winTile,
  ].flatMap((group) => {
    const match = group.match(/^([1-9]+)([mpsz])$/);
    if (!match) return [] as string[];
    return [...match[1]!].map((digit) => `${digit}${match[2]}`);
  });
}

export function computeYakuFromFacts(question: HandFacts): string[] {
  const labels = new Set<string>();
  const openMeldCount = question.openMelds.length;
  const allTiles = allTilesFromQuestion(question);
  const allTokens = allTiles.join('');
  const suitsInHand = new Set(allTiles.map((tile) => tile.slice(-1)));
  const suitSetNoZ = new Set(allTiles.filter((tile) => /[mps]/.test(tile.slice(-1))).map((tile) => tile.slice(-1)));

  if (!/(1|9|z)/.test(allTokens)) labels.add('断幺九');

  const honorTripletOrPair =
    [...question.groups, question.pair].some((group) => /^([1-7])\1\1z$/.test(group))
    || /^([1-7])\1z$/.test(question.pair);
  if (honorTripletOrPair) labels.add('役牌');

  const seqGroupsAll = [...question.groups, ...question.openMelds].filter((group) => /^[1-9]{3}[mps]$/.test(group));
  const hasIttsuInSuit = (suit: string) => {
    const patterns = new Set(seqGroupsAll.filter((group) => group.endsWith(suit)).map((group) => group.slice(0, 3)));
    return patterns.has('123') && patterns.has('456') && patterns.has('789');
  };
  if (hasIttsuInSuit('m') || hasIttsuInSuit('p') || hasIttsuInSuit('s')) labels.add('一气通贯');

  if (suitsInHand.has('z')) {
    if (suitsInHand.has('m') || suitsInHand.has('p') || suitsInHand.has('s')) labels.add('混一色');
  } else if (suitSetNoZ.size === 1) {
    labels.add('清一色');
  }

  const allMentsu = [...question.groups, ...question.openMelds, ...question.concealedKans];
  if (
    allMentsu.length > 0
    && allMentsu.every((group) => /^([1-9])\1\1[mpsz]$/.test(group) || /^([1-9])\1\1\1[mpsz]$/.test(group))
  ) {
    labels.add('对对和');
  }

  const openTriplets = question.openMelds.filter(
    (group) => /^([1-9])\1\1[mpsz]$/.test(group) || /^([1-9])\1\1\1[mpsz]$/.test(group),
  );
  const closedTriplets = question.groups.filter((group) => /^([1-9])\1\1[mpsz]$/.test(group));
  if (openTriplets.length === 0 && closedTriplets.length >= 3) labels.add('三暗刻');

  if (openMeldCount === 0) {
    const counts = new Map<string, number>();
    for (const group of seqGroupsAll) {
      const key = `${group.slice(0, 3)}${group.slice(-1)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const pairs = [...counts.values()].reduce((total, count) => total + Math.floor(count / 2), 0);
    if (pairs >= 1) labels.add('一盃口');
    if (pairs >= 2) labels.add('二杯口');
  }

  if (
    openMeldCount === 0
    && question.waitType === '两面听'
    && question.concealedKans.length === 0
  ) {
    const hasOnlySequences = question.groups.every((group) => /^[1-9]{3}[mps]$/.test(group));
    const pairHonor = /^([1-7])\1z$/.test(question.pair);
    if (hasOnlySequences && !pairHonor) labels.add('平和');
  }

  return [...labels];
}

export function yakuHanTotal(yaku: string[], open: boolean): number {
  return yaku.reduce((sum, label) => {
    if (label.startsWith('宝牌') || label === '赤宝牌') return sum;
    const option = YAKU_OPTIONS.find((item) => item.label === label);
    if (!option) return sum;
    const han = open && option.openHan !== undefined ? option.openHan : option.closedHan;
    return sum + (typeof han === 'number' ? han : 0);
  }, 0);
}
