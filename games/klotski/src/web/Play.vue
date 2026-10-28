<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ROOM_PLAY_KEY, submitRecord, type RoomPlayContext } from '@game-life/platform-web';
import { clonePieces, isWin, placeGroup, type Piece, type PieceMove } from '../board.js';
import { freshPieces, type KlotskiLevel } from '../levels.js';
import { KLOTSKI_GAME_ID } from '../meta.js';
import { klotskiRoutes } from '../routes.js';
import { solve } from '../solver.js';
import {
  KlotskiScene,
  type KlotskiDemoStatus,
  type KlotskiPhase,
  type KlotskiSceneState,
} from './scene/KlotskiScene.js';

const router = useRouter();
const roomPlay = inject<RoomPlayContext | null>(ROOM_PLAY_KEY, null);

const DEMO_STEP_MS = 1000;

const phase = ref<KlotskiPhase>('pick');
const demoStatus = ref<KlotskiDemoStatus>('solving');
let demoTimer: ReturnType<typeof setTimeout> | null = null;
let demoRun = 0;
const level = ref<KlotskiLevel | null>(null);
const pieces = ref<Piece[]>([]);
const history = ref<Array<{ pieces: Piece[]; steps: number }>>([]);
const steps = ref(0);
const startedAt = ref(0);
const clock = ref(0);
const submitting = ref(false);
const submitError = ref('');
const saved = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const host = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const scene = shallowRef<KlotskiScene | null>(null);
const sceneError = ref('');
let observer: ResizeObserver | null = null;
let resizeRaf = 0;
let disposed = false;

const clockText = computed(() => {
  const sec = startedAt.value ? Math.max(0, Math.round((clock.value - startedAt.value) / 1000)) : 0;
  const min = Math.floor(sec / 60);
  return `${min}:${String(sec % 60).padStart(2, '0')}`;
});

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function stopDemo() {
  demoRun += 1;
  if (demoTimer) clearTimeout(demoTimer);
  demoTimer = null;
}

function sceneState(): KlotskiSceneState {
  return {
    phase: phase.value,
    levelName: level.value?.name ?? '',
    minSteps: level.value?.minSteps ?? 0,
    pieces: pieces.value,
    steps: steps.value,
    clockText: clockText.value,
    submitting: submitting.value,
    submitError: submitError.value,
    showReplay: phase.value === 'done',
    demoStatus: demoStatus.value,
  };
}

function begin(next: KlotskiLevel) {
  stopDemo();
  level.value = next;
  pieces.value = freshPieces(next);
  history.value = [];
  steps.value = 0;
  saved.value = false;
  submitError.value = '';
  startedAt.value = Date.now();
  clock.value = startedAt.value;
  phase.value = 'play';
  stopTimer();
  timer = setInterval(() => {
    clock.value = Date.now();
  }, 250);
}

function onPlace(id: string, moves: PieceMove[], cost: number) {
  if (phase.value !== 'play' || cost < 1) return;
  const next = placeGroup(pieces.value, id, moves);
  if (!next) return;
  history.value = [...history.value, { pieces: clonePieces(pieces.value), steps: cost }];
  pieces.value = next;
  steps.value += cost;
  if (isWin(next)) {
    phase.value = 'done';
    clock.value = Date.now();
    stopTimer();
  }
}

function onUndo() {
  if (phase.value !== 'play' || history.value.length === 0) return;
  const previous = history.value[history.value.length - 1];
  if (!previous) return;
  history.value = history.value.slice(0, -1);
  pieces.value = clonePieces(previous.pieces);
  steps.value = Math.max(0, steps.value - previous.steps);
}

function onReset() {
  if (!level.value || (phase.value !== 'play' && phase.value !== 'demo')) return;
  begin(level.value);
}

function onDemo() {
  const current = level.value;
  if (!current || phase.value !== 'play') return;
  stopTimer();
  stopDemo();
  const run = demoRun;
  pieces.value = freshPieces(current);
  history.value = [];
  steps.value = 0;
  demoStatus.value = 'solving';
  phase.value = 'demo';
  // 先让「正在计算解法…」画出来，再做耗时的搜索
  demoTimer = setTimeout(() => {
    const plan = solve(pieces.value);
    if (run !== demoRun) return;
    if (!plan) {
      demoStatus.value = 'finished';
      return;
    }
    demoStatus.value = 'running';
    let index = 0;
    const tick = () => {
      if (run !== demoRun) return;
      const step = plan[index];
      if (!step) {
        demoStatus.value = 'finished';
        demoTimer = null;
        return;
      }
      pieces.value = pieces.value.map((piece) =>
        piece.id === step.id ? { ...piece, x: piece.x + step.dx, y: piece.y + step.dy } : piece,
      );
      steps.value += 1;
      index += 1;
      demoTimer = setTimeout(tick, index < plan.length ? DEMO_STEP_MS : 400);
    };
    demoTimer = setTimeout(tick, DEMO_STEP_MS);
  }, 60);
}

function onStopDemo() {
  if (!level.value || phase.value !== 'demo') return;
  begin(level.value);
}

function backToPick() {
  stopDemo();
  stopTimer();
  phase.value = 'pick';
  level.value = null;
  pieces.value = [];
  history.value = [];
  steps.value = 0;
}

watch(phase, async (next) => {
  if (next !== 'done' || saved.value || submitting.value || !level.value) return;
  submitting.value = true;
  submitError.value = '';
  const durationMs = Math.max(1000, clock.value - startedAt.value);
  try {
    await submitRecord(KLOTSKI_GAME_ID, {
      rawScore: steps.value,
      durationMs,
      meta: { kind: 'klotski', difficulty: level.value.id, layoutName: level.value.name },
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
  void router.push({ name: klotskiRoutes.introRouteName });
}

onMounted(async () => {
  const canvasEl = canvas.value;
  const hostEl = host.value;
  if (!canvasEl || !hostEl) return;
  try {
    const created = await KlotskiScene.create(canvasEl);
    if (disposed) {
      created.destroy();
      return;
    }
    created.setHandlers({
      onPick: begin,
      onPlace,
      onUndo,
      onReset,
      onReplay: backToPick,
      onDemo,
      onStopDemo,
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
    console.error('[klotski] PixiJS 场景初始化失败', error);
    sceneError.value = '画面加载失败，请刷新后重试';
  }
});

function fitScene(hostEl: HTMLElement) {
  const width = KlotskiScene.fitWidth(hostEl.clientWidth || 320, hostEl.clientHeight, phase.value);
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
  stopDemo();
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  observer?.disconnect();
  scene.value?.destroy();
  scene.value = null;
});
</script>

<template>
  <div class="klotski">
    <header class="bar">
      <button type="button" class="btn btn--ghost" @click="goBack">返回</button>
    </header>
    <div ref="host" class="stage">
      <canvas ref="canvas"></canvas>
    </div>
    <p v-if="sceneError" class="error">{{ sceneError }}</p>
  </div>
</template>

<style scoped>
.klotski {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bar {
  display: flex;
  align-items: center;
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
  touch-action: none;
}
.error {
  color: var(--danger);
}
</style>
