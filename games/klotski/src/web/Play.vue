<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ROOM_PLAY_KEY, submitRecord, type RoomPlayContext } from '@game-life/platform-web';
import { clonePieces, isWin, placePiece, type Piece } from '../board.js';
import { freshPieces, type KlotskiLevel } from '../levels.js';
import { KLOTSKI_GAME_ID } from '../meta.js';
import { klotskiRoutes } from '../routes.js';
import { KlotskiScene, type KlotskiSceneState } from './scene/KlotskiScene.js';

const router = useRouter();
const roomPlay = inject<RoomPlayContext | null>(ROOM_PLAY_KEY, null);

const phase = ref<'pick' | 'play' | 'done'>('pick');
const level = ref<KlotskiLevel | null>(null);
const pieces = ref<Piece[]>([]);
const history = ref<Piece[][]>([]);
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

function sceneState(): KlotskiSceneState {
  return {
    phase: phase.value,
    levelName: level.value?.name ?? '',
    pieces: pieces.value,
    steps: steps.value,
    clockText: clockText.value,
    submitting: submitting.value,
    submitError: submitError.value,
    showReplay: phase.value === 'done' && !roomPlay,
  };
}

function begin(next: KlotskiLevel) {
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

function onPlace(id: string, x: number, y: number) {
  if (phase.value !== 'play') return;
  const next = placePiece(pieces.value, id, x, y);
  if (!next) return;
  history.value = [...history.value, clonePieces(pieces.value)];
  pieces.value = next;
  steps.value += 1;
  if (isWin(next)) {
    phase.value = 'done';
    clock.value = Date.now();
    stopTimer();
  }
}

function onUndo() {
  if (phase.value !== 'play' || history.value.length === 0) return;
  const previous = history.value[history.value.length - 1];
  history.value = history.value.slice(0, -1);
  pieces.value = clonePieces(previous);
  steps.value = Math.max(0, steps.value - 1);
}

function onReset() {
  if (!level.value || phase.value !== 'play') return;
  begin(level.value);
}

function backToPick() {
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
    created.setHandlers({ onPick: begin, onPlace, onUndo, onReset, onReplay: backToPick });
    scene.value = created;
    created.resize(hostEl.clientWidth || 320);
    created.setState(sceneState());
    observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width <= 0) return;
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        scene.value?.resize(width);
      });
    });
    observer.observe(hostEl);
  } catch (error) {
    console.error('[klotski] PixiJS 场景初始化失败', error);
    sceneError.value = '画面加载失败，请刷新后重试';
  }
});

watch(sceneState, (state) => {
  scene.value?.setState(state);
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
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bar {
  display: flex;
  align-items: center;
}
.stage {
  width: min(100%, 420px);
  margin: 0 auto;
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
