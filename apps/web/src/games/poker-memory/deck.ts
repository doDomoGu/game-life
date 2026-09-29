/** 8 对扑克：同点数不同花色为一对 */
export interface CardFace {
  rank: string;
  suit: 'spade' | 'heart';
  pairId: number;
}

const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'] as const;

export function createDeck(): CardFace[] {
  const cards: CardFace[] = [];
  RANKS.forEach((rank, index) => {
    cards.push({ rank, suit: 'spade', pairId: index });
    cards.push({ rank, suit: 'heart', pairId: index });
  });
  return shuffle(cards);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function suitSymbol(suit: CardFace['suit']) {
  return suit === 'spade' ? '♠' : '♥';
}

export function suitColor(suit: CardFace['suit']) {
  return suit === 'heart' ? '#f87171' : '#e2e8f0';
}
