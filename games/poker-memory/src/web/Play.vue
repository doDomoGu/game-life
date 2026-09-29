<script setup lang="ts">
import { inject, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ROOM_PLAY_KEY, submitRecord, type RoomPlayContext } from '@game-life/platform-web';
import { POKER_MEMORY_GAME_ID } from '@game-life/game-poker-memory/meta';
import { pokerMemoryRoutes } from '../routes.js';
import { usePokerMemory } from './usePokerMemory';
import { suitColor, suitSymbol } from './deck';

const router = useRouter();
const roomPlay = inject<RoomPlayContext | null>(ROOM_PLAY_KEY, null);
const {
  cards,
  flipTurns,
  matchedPairs,
  totalPairs,
  finished,
  locked,
  reset,
  completeForTest,
  onCardTap,
  durationMs,
} = usePokerMemory();

const submitting = ref(false);
const submitError = ref('');
const saved = ref(false);

watch(
  finished,
  async (done) => {
    if (!done || saved.value || submitting.value) return;
    submitting.value = true;
    submitError.value = '';
    try {
      await submitRecord(POKER_MEMORY_GAME_ID, {
        rawScore: flipTurns.value,
        durationMs: durationMs(),
      });
      saved.value = true;
      if (roomPlay) await roomPlay.complete();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      submitError.value = msg ?? '成绩保存失败，请稍后重试';
    } finally {
      submitting.value = false;
    }
  },
);

function goIntro() {
  if (roomPlay) {
    router.push({ name: 'room', params: { code: roomPlay.code } });
    return;
  }
  router.push({ name: pokerMemoryRoutes.introRouteName });
}

function openHistory() {
  router.push({ name: 'game-history', params: { gameId: POKER_MEMORY_GAME_ID } });
}

function playAgain() {
  reset();
  saved.value = false;
  submitError.value = '';
}
</script>

<template>
  <div class="page play">
    <header class="play__header">
      <button type="button" class="btn btn--ghost play__back" @click="goIntro">返回</button>
      <div class="play__stats">
        <span>翻开次数 <strong>{{ flipTurns }}</strong></span>
        <span>配对 <strong>{{ matchedPairs }}/{{ totalPairs }}</strong></span>
      </div>
    </header>

    <p class="play__hint">翻开两张相同点数的牌即配对；每翻开两张计 1 次，次数越少越好。</p>
    <button v-if="!finished" type="button" class="btn btn--ghost test-btn" @click="completeForTest">
      测试：一键完成
    </button>

    <div class="board" :class="{ 'board--done': finished }">
      <button
        v-for="card in cards"
        :key="card.id"
        type="button"
        class="card"
        :class="{
          'card--flipped': card.flipped || card.matched,
          'card--matched': card.matched,
        }"
        :disabled="locked || card.matched || finished"
        @click="onCardTap(card.id)"
      >
        <span class="card__inner">
          <span class="card__back">🂠</span>
          <span class="card__front" :style="{ color: suitColor(card.face.suit) }">
            <span class="card__rank">{{ card.face.rank }}</span>
            <span class="card__suit">{{ suitSymbol(card.face.suit) }}</span>
          </span>
        </span>
      </button>
    </div>

    <div v-if="finished" class="result">
      <h2>全部配对完成</h2>
      <p>翻开次数：<strong>{{ flipTurns }}</strong>（理论最少 8 次）</p>
      <p v-if="submitting" class="muted">正在保存记录…</p>
      <p v-else-if="saved" class="ok">记录已保存</p>
      <p v-if="submitError" class="error">{{ submitError }}</p>
      <div v-if="!roomPlay" class="result__actions">
        <button type="button" class="btn" @click="playAgain">再玩一局</button>
        <button type="button" class="btn btn--ghost" @click="openHistory">
          查看历史
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.play__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.play__back {
  padding: 0 12px;
  min-height: 40px;
}

.play__stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 14px;
  color: var(--muted);
  gap: 2px;
}

.play__stats strong {
  color: var(--accent);
  font-size: 18px;
}

.play__hint {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 8px;
  line-height: 1.4;
}

.test-btn {
  width: 100%;
  margin-bottom: 16px;
  min-height: 36px;
  font-size: 13px;
}

.board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

@media (min-width: 768px) {
  .board {
    gap: 12px;
    max-width: 420px;
    margin: 0 auto;
  }
}

.card {
  aspect-ratio: 3 / 4;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  perspective: 600px;
}

.card:disabled {
  cursor: default;
}

.card__inner {
  display: block;
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.35s ease;
  border-radius: 10px;
}

.card--flipped .card__inner {
  transform: rotateY(180deg);
}

.card__back,
.card__front {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  backface-visibility: hidden;
  border-radius: 10px;
  border: 2px solid #334155;
}

.card__back {
  background: linear-gradient(145deg, #1d4ed8, #1e3a8a);
  font-size: clamp(24px, 8vw, 36px);
}

.card__front {
  transform: rotateY(180deg);
  background: #f8fafc;
  color: #0f172a;
}

.card--matched .card__front {
  border-color: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.35);
}

.card__rank {
  font-size: clamp(20px, 7vw, 28px);
  font-weight: 800;
  line-height: 1;
}

.card__suit {
  font-size: clamp(22px, 8vw, 32px);
  line-height: 1;
  margin-top: 4px;
}

.result {
  margin-top: 24px;
  padding: 16px;
  background: var(--surface);
  border-radius: var(--radius);
  text-align: center;
}

.result h2 {
  margin: 0 0 8px;
  font-size: 20px;
}

.result p {
  margin: 6px 0;
}

.muted {
  color: var(--muted);
  font-size: 14px;
}

.ok {
  color: #4ade80;
  font-size: 14px;
}

.result__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

@media (min-width: 480px) {
  .result__actions {
    flex-direction: row;
    justify-content: center;
  }
}
</style>
