import { collectHandTiles, buildWinTiles } from './structure.js';
import type { HandFacts, Question } from './types.js';

const SUIT_ORDER: Record<string, number> = { m: 0, p: 1, s: 2, z: 3 };

export function closedTiles13(facts: HandFacts): string[] {
  const tiles14 = collectHandTiles(buildWinTiles(facts));
  let removed = false;
  const tiles13 = tiles14.filter((tile) => {
    if (!removed && tile === facts.winTile) {
      removed = true;
      return false;
    }
    return true;
  });
  return [...tiles13].sort((a, b) => {
    const suitDiff = (SUIT_ORDER[a.slice(-1)] ?? 0) - (SUIT_ORDER[b.slice(-1)] ?? 0);
    if (suitDiff !== 0) return suitDiff;
    return Number(a[0]) - Number(b[0]);
  });
}

export function markRedTiles(tiles: string[], redCount: number): boolean[] {
  let remaining = redCount;
  return tiles.map((tile) => {
    if (tile[0] === '5' && tile.slice(-1) !== 'z' && remaining > 0) {
      remaining -= 1;
      return true;
    }
    return false;
  });
}

export function yakuLine(question: Question): string {
  return question.yaku.filter((label) => !label.startsWith('宝牌') && label !== '赤宝牌').join(' · ') || '役种见牌面';
}

export type PaymentField = 'ron' | 'each' | 'child' | 'dealer';

export function paymentFields(question: Question): Array<{ id: PaymentField; label: string }> {
  if (question.winType === 'ron') return [{ id: 'ron', label: '点炮者支付' }];
  if (question.dealer) return [{ id: 'each', label: '三家各支付' }];
  return [
    { id: 'child', label: '子家各支付' },
    { id: 'dealer', label: '庄家支付' },
  ];
}

export interface AnswerDraft {
  fu: string;
  han: string;
  ron: string;
  each: string;
  child: string;
  dealer: string;
}

export function emptyDraft(): AnswerDraft {
  return { fu: '', han: '', ron: '', each: '', child: '', dealer: '' };
}

function parsePoints(value: string): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

export function gradeDraft(question: Question, draft: AnswerDraft): boolean {
  const fu = parsePoints(draft.fu);
  const han = parsePoints(draft.han);
  if (fu !== question.fu || han !== question.han) return false;
  if (question.winType === 'ron') return parsePoints(draft.ron) === question.answer.ron;
  if (question.dealer) return parsePoints(draft.each) === question.answer.each;
  return parsePoints(draft.child) === question.answer.child && parsePoints(draft.dealer) === question.answer.dealer;
}
