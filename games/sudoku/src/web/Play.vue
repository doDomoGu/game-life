<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { ROOM_PLAY_KEY, submitRecord, type RoomPlayContext } from '@game-life/platform-web';
import { SUDOKU_GAME_ID } from '../meta.js';
import {
  clearPeerNotes,
  difficultyLabel,
  generatePuzzle,
  isComplete,
  isDigitComplete,
  toggleNote,
  type Difficulty,
  type GeneratedPuzzle,
} from '../sudoku.js';
import { SudokuScene, type SudokuSceneState } from './scene/SudokuScene.js';

const roomPlay = inject<RoomPlayContext | null>(ROOM_PLAY_KEY, null);

const phase = ref<'pick' | 'generating' | 'play' | 'done'>('pick');
const puzzle = ref<GeneratedPuzzle | null>(null);
const values = ref<number[]>([]);
const notes = ref<number[][]>([]);
const selected = ref(0);
const draftMode = ref(false);
const startedAt = ref(0);
const clock = ref(0);
const submitting = ref(false);
const submitError = ref('');
const saved = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const host = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const scene = shallowRef<SudokuScene | null>(null);
const sceneError = ref('');
let observer: ResizeObserver | null = null;
let resizeRaf = 0;
let disposed = false;

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

function sceneState(): SudokuSceneState {
  return {
    phase: phase.value,
    values: values.value,
    notes: notes.value,
    givens: Array.from({ length: 81 }, (_, index) => givens.value.has(index)),
    selected: selected.value,
    draftMode: draftMode.value,
    difficultyLabel: puzzle.value ? difficultyLabel(puzzle.value.difficulty) : '',
    clockText: clockText.value,
    submitting: submitting.value,
    submitError: submitError.value,
    showReplay: phase.value === 'done' && !roomPlay,
  };
}

async function start(difficulty: Difficulty) {
  phase.value = 'generating';
  await new Promise((resolve) => setTimeout(resolve, 30));
  const next = generatePuzzle(difficulty);
  puzzle.value = next;
  values.value = next.puzzle.slice();
  notes.value = Array.from({ length: 81 }, () => []);
  draftMode.value = false;
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
  const index = selected.value;
  if (draftMode.value) {
    if (value === 0) {
      if (values.value[index]) {
        const next = values.value.slice();
        next[index] = 0;
        values.value = next;
      }
      notes.value = notes.value.map((cell, cellIndex) => (cellIndex === index ? [] : cell));
      return;
    }
    if (values.value[index]) return;
    const current = notes.value[index] ?? [];
    if (!current.includes(value) && isDigitComplete(values.value, value)) return;
    notes.value = notes.value.map((cell, cellIndex) => (cellIndex === index ? toggleNote(cell, value) : cell));
    return;
  }
  if (value !== 0 && values.value[index] !== value && isDigitComplete(values.value, value)) return;
  const next = values.value.slice();
  next[index] = value;
  values.value = next;
  notes.value = value === 0 ? notes.value.map((cell, cellIndex) => (cellIndex === index ? [] : cell)) : clearPeerNotes(notes.value, index, value);
  if (isComplete(next)) {
    phase.value = 'done';
    clock.value = Date.now();
    stopTimer();
  }
}

function toggleDraft() {
  if (phase.value !== 'play') return;
  draftMode.value = !draftMode.value;
}

function backToPick() {
  stopTimer();
  phase.value = 'pick';
  puzzle.value = null;
  values.value = [];
  notes.value = [];
  draftMode.value = false;
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

onMounted(async () => {
  const canvasEl = canvas.value;
  const hostEl = host.value;
  if (!canvasEl || !hostEl) return;
  try {
    const created = await SudokuScene.create(canvasEl);
    if (disposed) {
      created.destroy();
      return;
    }
    created.setHandlers({
      onPick: start,
      onSelect: selectCell,
      onDigit: writeNumber,
      onToggleDraft: toggleDraft,
      onReplay: backToPick,
    });
    scene.value = created;
    fitScene(hostEl);
    created.setState(sceneState());
    observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width <= 0) return;
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        const hostNow = host.value;
        if (hostNow) fitScene(hostNow);
      });
    });
    observer.observe(hostEl);
  } catch (error) {
    console.error('[sudoku] PixiJS 场景初始化失败', error);
    sceneError.value = '画面加载失败，请刷新后重试';
  }
});

function fitScene(hostEl: HTMLElement) {
  const width = SudokuScene.fitWidth(hostEl.clientWidth || 320, hostEl.clientHeight, phase.value);
  scene.value?.resize(width);
}

watch(sceneState, (state) => {
  scene.value?.setState(state);
  const hostEl = host.value;
  if (hostEl) fitScene(hostEl);
});

onBeforeUnmount(() => {
  disposed = true;
  stopTimer();
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  observer?.disconnect();
  scene.value?.destroy();
  scene.value = null;
});
</script>

<template>
  <div class="sudo">
    <div ref="host" class="stage">
      <canvas ref="canvas"></canvas>
    </div>
    <p v-if="sceneError" class="error">{{ sceneError }}</p>
  </div>
</template>

<style scoped>
.sudo {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.muted {
  color: var(--muted);
}
.stage {
  flex: 1;
  min-height: 0;
  width: min(100%, 420px);
  margin: 0 auto;
  overflow: hidden;
}
.stage canvas {
  display: block;
  width: 100%;
  height: auto;
}
.error {
  color: var(--danger);
}
</style>
