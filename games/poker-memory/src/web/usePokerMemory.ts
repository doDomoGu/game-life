import { ref, computed } from 'vue';
import { pokerMemoryMeta } from '../meta.js';
import { createDeck, type CardFace } from './deck';

export type CardState = {
  id: number;
  face: CardFace;
  flipped: boolean;
  matched: boolean;
};

const FLIP_BACK_MS = 700;

export function usePokerMemory() {
  const cards = ref<CardState[]>([]);
  const flipTurns = ref(0);
  const matchedPairs = ref(0);
  const startedAt = ref<number | null>(null);
  const locked = ref(false);
  const firstPick = ref<number | null>(null);
  const finished = ref(false);

  const totalPairs = pokerMemoryMeta.pairCount;

  const isComplete = computed(() => matchedPairs.value >= totalPairs);

  function reset() {
    const deck = createDeck();
    cards.value = deck.map((face, id) => ({
      id,
      face,
      flipped: false,
      matched: false,
    }));
    flipTurns.value = 0;
    matchedPairs.value = 0;
    startedAt.value = null;
    locked.value = false;
    firstPick.value = null;
    finished.value = false;
  }

  function durationMs() {
    if (startedAt.value == null) return 0;
    return Date.now() - startedAt.value;
  }

  function onCardTap(cardId: number) {
    if (locked.value || finished.value) return;
    const card = cards.value[cardId];
    if (!card || card.matched || card.flipped) return;

    if (startedAt.value == null) {
      startedAt.value = Date.now();
    }

    card.flipped = true;

    if (firstPick.value == null) {
      firstPick.value = cardId;
      return;
    }

    if (firstPick.value === cardId) {
      return;
    }

    flipTurns.value += 1;
    locked.value = true;

    const first = cards.value[firstPick.value];
    const second = card;

    if (first.face.pairId === second.face.pairId) {
      first.matched = true;
      second.matched = true;
      matchedPairs.value += 1;
      firstPick.value = null;
      locked.value = false;
      if (matchedPairs.value >= totalPairs) {
        finished.value = true;
      }
      return;
    }

    window.setTimeout(() => {
      first.flipped = false;
      second.flipped = false;
      firstPick.value = null;
      locked.value = false;
    }, FLIP_BACK_MS);
  }

  function completeForTest() {
    if (finished.value) return;
    if (startedAt.value == null) startedAt.value = Date.now();
    for (const card of cards.value) {
      card.flipped = true;
      card.matched = true;
    }
    matchedPairs.value = totalPairs;
    flipTurns.value = totalPairs;
    locked.value = false;
    firstPick.value = null;
    finished.value = true;
  }

  reset();

  return {
    cards,
    flipTurns,
    matchedPairs,
    totalPairs,
    isComplete,
    finished,
    locked,
    reset,
    completeForTest,
    onCardTap,
    durationMs,
  };
}
