<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ROOM_PLAY_KEY, submitRecord, type RoomPlayContext } from '@game-life/platform-web';
import { SUDOKU_GAME_ID } from '../meta.js';
import { sudokuRoutes } from '../routes.js';
import {
  DIFFICULTIES,
  difficultyLabel,
  generatePuzzle,
  hasConflict,
  isComplete,
  type Difficulty,
  type GeneratedPuzzle,
} from '../sudoku.js';

const router = useRouter();
const roomPlay = inject<RoomPlayContext | null>(ROOM_PLAY_KEY, null);

const phase = ref<'pick' | 'generating' | 'play' | 'done'>('pick');
const puzzle = ref<GeneratedPuzzle | null>(null);
const values = ref<number[]>([]);
const selected = ref(0);
const startedAt = ref(0);
const clock = ref(0);
const submitting = ref(false);
const submitError = ref('');
const saved = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const givens = computed(() => new Set(puzzle.value?.puzzle.map((value, index) => (value ? index : -1)) ?? []));
const elapsedSec = computed(() => (startedAt.value ? Math.max(1, Math.round((clock.value - startedAt.value) / 1000)) : 0));
const clockText = computed(() => {
  const sec = elapsedSec.value;
  const min = Math.floor(sec / 60);
  return `${min}:${String(sec % 60).padStart(2, '0')}`;
});

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function cellClass(index: number) {
  const value = values.value[index] ?? 0;
  const row = Math.floor(index / 9);
  const col = index % 9;
  const selectedRow = Math.floor(selected.value / 9);
  const selectedCol = selected.value % 9;
  const sameBox =
    Math.floor(row / 3) === Math.floor(selectedRow / 3) &&
    Math.floor(col / 3) === Math.floor(selectedCol / 3);
  return {
    given: givens.value.has(index),
    selected: index === selected.value,
    peer: row === selectedRow || col === selectedCol || sameBox,
    same: value !== 0 && value === values.value[selected.value],
    conflict: hasConflict(values.value, index),
    'edge-r': col % 3 === 2 && col !== 8,
    'edge-b': row % 3 === 2 && row !== 8,
  };
}

async function start(difficulty: Difficulty) {
  phase.value = 'generating';
  await new Promise((resolve) => setTimeout(resolve, 30));
  const next = generatePuzzle(difficulty);
  puzzle.value = next;
  values.value = next.puzzle.slice();
  selected.value = next.puzzle.findIndex((value) => value === 0);
  if (selected.value < 0) selected.value = 0;
  startedAt.value = Date.now();
  clock.value = startedAt.value;
  saved.value = false;
  submitError.value = '';
  phase.value = 'play';
  stopTimer();
  timer = setInterval(() => {
    clock.value = Date.now();
  }, 250);
}

function selectCell(index: number) {
  if (phase.value !== 'play') return;
  selected.value = index;
}

function writeNumber(value: number) {
  if (phase.value !== 'play' || givens.value.has(selected.value)) return;
  const next = values.value.slice();
  next[selected.value] = value;
  values.value = next;
  if (isComplete(next)) {
    phase.value = 'done';
    clock.value = Date.now();
    stopTimer();
  }
}

function backToPick() {
  stopTimer();
  phase.value = 'pick';
  puzzle.value = null;
  values.value = [];
}

watch(phase, async (next) => {
  if (next !== 'done' || saved.value || submitting.value || !puzzle.value) return;
  submitting.value = true;
  submitError.value = '';
  const durationMs = Math.max(1000, clock.value - startedAt.value);
  try {
    await submitRecord(SUDOKU_GAME_ID, {
      rawScore: Math.max(1, Math.round(durationMs / 1000)),
      durationMs,
      meta: { kind: 'sudoku', difficulty: puzzle.value.difficulty },
    });
    saved.value = true;
    if (roomPlay) await roomPlay.complete();
  } catch (error: unknown) {
    const message =
      error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
    submitError.value = message ?? '成绩保存失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
});

function goBack() {
  if (roomPlay) {
    void router.push({ name: 'room', params: { code: roomPlay.code } });
    return;
  }
  void router.push({ name: sudokuRoutes.introRouteName });
}

onBeforeUnmount(stopTimer);
</script>

<template>
  <div class="sudo">
    <header class="bar">
      <button type="button" class="btn btn--ghost" @click="goBack">返回</button>
      <strong v-if="phase === 'play' || phase === 'done'">{{ clockText }}</strong>
      <span v-if="puzzle" class="muted">{{ difficultyLabel(puzzle.difficulty) }}</span>
    </header>

    <section v-if="phase === 'pick'" class="pick">
      <h2>选择难度</h2>
      <button
        v-for="item in DIFFICULTIES"
        :key="item.id"
        type="button"
        class="btn pick__btn"
        @click="start(item.id)"
      >
        {{ item.label }}
      </button>
    </section>

    <p v-else-if="phase === 'generating'" class="muted">正在出题…</p>

    <template v-else>
      <div class="grid" role="grid">
        <button
          v-for="(_value, index) in values"
          :key="index"
          type="button"
          class="cell"
          :class="cellClass(index)"
          @click="selectCell(index)"
        >
          {{ values[index] || '' }}
        </button>
      </div>

      <div v-if="phase === 'play'" class="pad">
        <button v-for="n in 9" :key="n" type="button" class="key" @click="writeNumber(n)">{{ n }}</button>
        <button type="button" class="key" @click="writeNumber(0)">擦除</button>
      </div>

      <section v-else class="result">
        <h2>完成</h2>
        <p>{{ puzzle ? difficultyLabel(puzzle.difficulty) : '' }} · 用时 {{ clockText }}</p>
        <p v-if="submitting" class="muted">正在保存…</p>
        <p v-else-if="submitError" class="error">{{ submitError }}</p>
        <button v-if="!roomPlay" type="button" class="btn" @click="backToPick">再来一局</button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.sudo {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.muted {
  color: var(--muted);
}
.pick {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pick h2,
.result h2 {
  margin: 0;
}
.pick__btn {
  width: 100%;
}
.grid {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  width: min(100%, 420px);
  margin: 0 auto;
  aspect-ratio: 1;
  background: #334155;
  border: 2px solid #334155;
}
.cell {
  min-height: 0;
  padding: 0;
  border: 0;
  background: #f8fafc;
  color: #0369a1;
  font-weight: 700;
  font-size: clamp(14px, 4.2vw, 22px);
}
.cell.given {
  color: #0f172a;
}
.cell.peer {
  background: #e0f2fe;
}
.cell.same {
  background: #bae6fd;
}
.cell.selected {
  background: #38bdf8;
  color: #0f172a;
}
.cell.conflict {
  background: #fecaca;
  color: #b91c1c;
}
.cell.edge-r {
  border-right: 2px solid #334155;
}
.cell.edge-b {
  border-bottom: 2px solid #334155;
}
.pad {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}
.key {
  min-height: 44px;
  border: 0;
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font-weight: 700;
  font-size: 18px;
}
.result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.error {
  color: var(--danger);
}
</style>
