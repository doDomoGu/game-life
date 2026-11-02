<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import {
  fetchMyScores,
  submitRecord,
} from '@game-life/platform-web';
import type { MyGameScore, SudokuDifficulty } from '@game-life/shared';
import { SUDOKU_GAME_ID } from '../meta.js';
import {
  clearPeerNotes,
  DIFFICULTIES,
  difficultyLabel,
  isComplete,
  isDigitComplete,
  toggleNote,
  type Difficulty,
} from '../sudoku.js';
import { getPuzzle, listPuzzles, PUZZLES_PER_DIFFICULTY, type FixedPuzzle } from '../bank.js';
import { SudokuScene, type SudokuSceneState } from './scene/SudokuScene.js';

const phase = ref<'pick' | 'generating' | 'play' | 'done'>('pick');
const difficulty = ref<Difficulty>('easy');
const puzzle = ref<FixedPuzzle | null>(null);
const values = ref<number[]>([]);
const notes = ref<number[][]>([]);
const selected = ref(0);
const draftMode = ref(false);
const clock = ref(Date.now());
const activeMs = ref(0);
const submitting = ref(false);
const saved = ref(false);
const submitError = ref('');
const scores = ref<MyGameScore[]>([]);
const scoreError = ref('');
const lastResult = ref<{ puzzleId: number; timeMs: number; newBest: boolean } | null>(null);
let runningSince = 0;
let timer: ReturnType<typeof setInterval> | null = null;

const host = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const scene = shallowRef<SudokuScene | null>(null);
const sceneError = ref('');
let observer: ResizeObserver | null = null;
let resizeRaf = 0;
let disposed = false;

const givens = computed(
  () => new Set(puzzle.value?.puzzle.map((value, index) => (value ? index : -1)) ?? []),
);
const elapsedMs = computed(() => {
  clock.value;
  return activeMs.value + (runningSince ? Date.now() - runningSince : 0);
});
const clockText = computed(() => formatClock(elapsedMs.value));
const puzzleList = computed(() => listPuzzles(difficulty.value));
const sudokuScore = computed(
  () => scores.value.find((item) => item.gameId === SUDOKU_GAME_ID)?.sudoku ?? null,
);
const bestByPuzzle = computed(() => {
  const result = new Map<number, number>();
  for (const progress of sudokuScore.value ?? []) {
    if (progress.difficulty !== difficulty.value) continue;
    for (const item of progress.puzzles) result.set(item.id, item.bestTimeMs);
  }
  return result;
});
const completedByDifficulty = computed(() => {
  const result: Record<SudokuDifficulty, number> = { easy: 0, normal: 0, hard: 0 };
  for (const progress of sudokuScore.value ?? []) result[progress.difficulty] = progress.completed;
  return result;
});

function formatClock(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(sec / 60);
  return `${min}:${String(sec % 60).padStart(2, '0')}`;
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function syncTimer() {
  const now = Date.now();
  clock.value = now;
  if (phase.value !== 'play') return;
  if (document.visibilityState === 'hidden') {
    if (runningSince) {
      activeMs.value += now - runningSince;
      runningSince = 0;
    }
  } else if (!runningSince) {
    runningSince = now;
  }
}

function onVisibilityChange() {
  syncTimer();
}

function startPuzzle(nextDifficulty: Difficulty, id: number) {
  const next = getPuzzle(nextDifficulty, id);
  if (!next) return;
  puzzle.value = next;
  values.value = next.puzzle.slice();
  notes.value = Array.from({ length: 81 }, () => []);
  draftMode.value = false;
  selected.value = next.puzzle.findIndex((value) => value === 0);
  if (selected.value < 0) selected.value = 0;
  activeMs.value = 0;
  runningSince = document.visibilityState === 'visible' ? Date.now() : 0;
  clock.value = Date.now();
  saved.value = false;
  submitError.value = '';
  lastResult.value = null;
  phase.value = 'play';
  stopTimer();
  timer = setInterval(syncTimer, 250);
  void nextTick(() => {
    if (host.value) fitScene(host.value);
  });
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
    notes.value = notes.value.map((cell, cellIndex) =>
      cellIndex === index ? toggleNote(cell, value) : cell,
    );
    return;
  }
  if (value !== 0 && values.value[index] !== value && isDigitComplete(values.value, value)) return;
  const next = values.value.slice();
  next[index] = value;
  values.value = next;
  notes.value =
    value === 0
      ? notes.value.map((cell, cellIndex) => (cellIndex === index ? [] : cell))
      : clearPeerNotes(notes.value, index, value);
  if (isComplete(next)) completePuzzle();
}

function toggleDraft() {
  if (phase.value !== 'play') return;
  draftMode.value = !draftMode.value;
}

function completePuzzle() {
  syncTimer();
  if (runningSince) {
    activeMs.value += Date.now() - runningSince;
    runningSince = 0;
  }
  clock.value = Date.now();
  stopTimer();
  phase.value = 'done';
}

function backToPicker() {
  stopTimer();
  runningSince = 0;
  activeMs.value = 0;
  phase.value = 'pick';
  puzzle.value = null;
  values.value = [];
  notes.value = [];
  draftMode.value = false;
  void loadScores();
}

async function loadScores() {
  scoreError.value = '';
  try {
    scores.value = await fetchMyScores();
  } catch {
    scoreError.value = '积分加载失败';
  }
}

async function saveCompletion() {
  if (!puzzle.value || submitting.value || saved.value) return;
  const currentPuzzle = puzzle.value;
  const durationMs = Math.max(1000, elapsedMs.value);
  const previousBest = bestByPuzzleFor(currentPuzzle.difficulty, currentPuzzle.id);
  submitting.value = true;
  submitError.value = '';
  try {
    await submitRecord(SUDOKU_GAME_ID, {
      rawScore: Math.max(1, Math.round(durationMs / 1000)),
      durationMs,
      meta: {
        kind: 'sudoku',
        difficulty: currentPuzzle.difficulty,
        puzzleId: currentPuzzle.id,
        timeMs: durationMs,
      },
    });
    saved.value = true;
    lastResult.value = {
      puzzleId: currentPuzzle.id,
      timeMs: durationMs,
      newBest: previousBest == null || durationMs < previousBest,
    };
    await loadScores();
  } catch (error: unknown) {
    const message =
      error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
    submitError.value = message ?? '成绩保存失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
}

function bestByPuzzleFor(forDifficulty: Difficulty, id: number): number | null {
  for (const progress of sudokuScore.value ?? []) {
    if (progress.difficulty !== forDifficulty) continue;
    return progress.puzzles.find((item) => item.id === id)?.bestTimeMs ?? null;
  }
  return null;
}

function bestLabel(id: number): string {
  const best = bestByPuzzle.value.get(id);
  return best == null ? '' : formatClock(best);
}

function sceneState(): SudokuSceneState {
  return {
    phase: phase.value,
    values: values.value,
    notes: notes.value,
    givens: Array.from({ length: 81 }, (_, index) => givens.value.has(index)),
    selected: selected.value,
    draftMode: draftMode.value,
    difficultyLabel: puzzle.value
      ? `${difficultyLabel(puzzle.value.difficulty)} · 第 ${puzzle.value.id} 题`
      : '',
    clockText: clockText.value,
    submitting: submitting.value,
    submitError: submitError.value,
    showReplay: false,
  };
}

watch(phase, async (next) => {
  if (next === 'done') await saveCompletion();
  await nextTick();
  if (host.value) fitScene(host.value);
});

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibilityChange);
  void loadScores();
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
      onPick: () => undefined,
      onSelect: selectCell,
      onDigit: writeNumber,
      onToggleDraft: toggleDraft,
      onReplay: backToPicker,
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
        if (hostNow && phase.value !== 'pick') fitScene(hostNow);
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
  if (hostEl && phase.value !== 'pick') fitScene(hostEl);
});

onBeforeUnmount(() => {
  disposed = true;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  stopTimer();
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  observer?.disconnect();
  scene.value?.destroy();
  scene.value = null;
});
</script>

<template>
  <div class="sudo">
    <section v-show="phase === 'pick'" class="picker">
      <header class="picker__head">
        <div>
          <h3>选择题目</h3>
          <p>每档固定 30 题，通关后可重玩刷新最佳用时</p>
        </div>
        <span v-if="scoreError" class="error">{{ scoreError }}</span>
      </header>

      <div class="diffs">
        <button
          v-for="item in DIFFICULTIES"
          :key="item.id"
          type="button"
          class="diff"
          :class="{ 'diff--active': difficulty === item.id }"
          @click="difficulty = item.id"
        >
          <strong>{{ item.label }}</strong>
          <small>{{ completedByDifficulty[item.id] }} / {{ PUZZLES_PER_DIFFICULTY }}</small>
        </button>
      </div>

      <div class="puzzle-grid">
        <button
          v-for="item in puzzleList"
          :key="item.id"
          type="button"
          class="puzzle"
          :class="{ 'puzzle--done': bestByPuzzle.has(item.id) }"
          @click="startPuzzle(item.difficulty, item.id)"
        >
          <span class="puzzle__no">{{ item.id }}</span>
          <span class="puzzle__best">{{ bestLabel(item.id) || '未完成' }}</span>
        </button>
      </div>

      <p v-if="lastResult" class="notice">
        第 {{ lastResult.puzzleId }} 题完成 · {{ formatClock(lastResult.timeMs) }}
        <template v-if="lastResult.newBest"> · 新纪录</template>
      </p>
    </section>

    <div v-show="phase !== 'pick'" ref="host" class="stage">
      <canvas ref="canvas"></canvas>
      <div v-if="phase === 'done'" class="done-panel">
        <template v-if="saved">
          <p class="done-title">
            完成 · {{ clockText }}
            <span v-if="lastResult?.newBest" class="new-best">新纪录</span>
          </p>
          <button type="button" class="done-button" @click="backToPicker">返回题库</button>
        </template>
        <template v-else-if="submitting">
          <p class="done-title">正在保存成绩…</p>
        </template>
        <template v-else>
          <p class="done-title error">{{ submitError || '成绩保存失败' }}</p>
          <div class="done-actions">
            <button type="button" class="done-button" @click="saveCompletion">重试保存</button>
            <button type="button" class="done-button done-button--ghost" @click="backToPicker">
              返回题库
            </button>
          </div>
        </template>
      </div>
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
  position: relative;
}
.picker {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.picker__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.picker__head h3 {
  margin: 0;
  font-size: 18px;
}
.picker__head p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
}
.diffs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.diff {
  min-height: 56px;
  border: 1px solid #334155;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font: inherit;
  cursor: pointer;
}
.diff small {
  color: var(--muted);
  font-size: 11px;
}
.diff--active {
  border-color: var(--accent);
  background: rgba(56, 189, 248, 0.14);
}
.diff--active small {
  color: var(--accent);
}
.puzzle-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}
.puzzle {
  min-height: 56px;
  border: 1px solid #334155;
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font: inherit;
  cursor: pointer;
}
.puzzle--done {
  border-color: rgba(74, 222, 128, 0.5);
  background: rgba(74, 222, 128, 0.08);
}
.puzzle__no {
  font-size: 16px;
  font-weight: 700;
}
.puzzle__best {
  color: var(--muted);
  font-size: 10px;
}
.puzzle--done .puzzle__best {
  color: #4ade80;
}
.notice {
  margin: 0;
  color: #4ade80;
  font-size: 13px;
}
.stage {
  flex: 1;
  min-height: 0;
  width: min(100%, 420px);
  margin: 0 auto;
  overflow: hidden;
  position: relative;
}
.stage canvas {
  display: block;
  width: 100%;
  height: auto;
}
.done-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(10, 16, 32, 0.88);
  border: 1px solid rgba(240, 195, 106, 0.35);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.done-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.new-best {
  color: #4ade80;
  font-size: 12px;
}
.done-button {
  min-height: 42px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: var(--accent);
  color: #0f172a;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.done-button--ghost {
  background: transparent;
  border-color: #334155;
  color: var(--text);
}
.done-actions {
  display: flex;
  gap: 8px;
}
.done-actions .done-button {
  flex: 1;
}
.error {
  color: var(--danger);
  font-size: 13px;
}
.muted {
  color: var(--muted);
}
</style>
