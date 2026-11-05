<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { ROOM_PLAY_KEY, submitRecord, type RoomPlayContext } from '@game-life/platform-web';
import { emptyDraft, gradeDraft, type AnswerDraft } from '../display.js';
import { generateRound } from '../generate.js';
import { MAHJONG_SCORE_GAME_ID, type QuestionCount } from '../meta.js';
import type { Question } from '../types.js';
import {
  ScoreScene,
  type FocusField,
  type ScorePhase,
  type ScoreSceneState,
} from './scene/ScoreScene.js';

const roomPlay = inject<RoomPlayContext | null>(ROOM_PLAY_KEY, null);

const phase = ref<ScorePhase>('pick');
const questions = ref<Question[]>([]);
const index = ref(0);
const correct = ref(0);
const draft = ref<AnswerDraft>(emptyDraft());
const focus = ref<FocusField>('fu');
const lastCorrect = ref(false);
const startedAt = ref(0);
const submitting = ref(false);
const submitError = ref('');
const saved = ref(false);

const host = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const scene = shallowRef<ScoreScene | null>(null);
const sceneError = ref('');
let observer: ResizeObserver | null = null;
let resizeRaf = 0;
let disposed = false;

function currentQuestion(): Question | null {
  return questions.value[index.value] ?? null;
}

function sceneState(): ScoreSceneState {
  return {
    phase: phase.value,
    question: currentQuestion(),
    index: index.value,
    total: questions.value.length,
    correct: correct.value,
    draft: draft.value,
    focus: focus.value,
    lastCorrect: lastCorrect.value,
    submitting: submitting.value,
    submitError: submitError.value,
    showReplay: phase.value === 'done' && !roomPlay,
  };
}

function begin(count: QuestionCount) {
  questions.value = generateRound(count);
  index.value = 0;
  correct.value = 0;
  draft.value = emptyDraft();
  focus.value = 'fu';
  lastCorrect.value = false;
  saved.value = false;
  submitError.value = '';
  startedAt.value = Date.now();
  phase.value = 'play';
}

function onFocus(field: FocusField) {
  if (phase.value !== 'play') return;
  focus.value = field;
}

function onDigit(digit: string) {
  if (phase.value !== 'play') return;
  const current = draft.value[focus.value];
  if (current.length >= 6) return;
  draft.value = { ...draft.value, [focus.value]: `${current}${digit}` };
}

function onBackspace() {
  if (phase.value !== 'play') return;
  const current = draft.value[focus.value];
  draft.value = { ...draft.value, [focus.value]: current.slice(0, -1) };
}

function onSubmit() {
  const question = currentQuestion();
  if (phase.value !== 'play' || !question) return;
  lastCorrect.value = gradeDraft(question, draft.value);
  if (lastCorrect.value) correct.value += 1;
  phase.value = 'result';
}

function onNext() {
  if (phase.value !== 'result') return;
  if (index.value + 1 >= questions.value.length) {
    phase.value = 'done';
    return;
  }
  index.value += 1;
  draft.value = emptyDraft();
  focus.value = 'fu';
  lastCorrect.value = false;
  phase.value = 'play';
}

function onReplay() {
  phase.value = 'pick';
  questions.value = [];
  index.value = 0;
  correct.value = 0;
  draft.value = emptyDraft();
}

watch(phase, async (next) => {
  if (next !== 'done' || saved.value || submitting.value) return;
  submitting.value = true;
  submitError.value = '';
  const durationMs = Math.max(1000, Date.now() - startedAt.value);
  try {
    await submitRecord(MAHJONG_SCORE_GAME_ID, {
      rawScore: correct.value,
      durationMs,
      meta: { kind: 'mahjong-score', total: questions.value.length, correct: correct.value },
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
    const created = await ScoreScene.create(canvasEl);
    if (disposed) {
      created.destroy();
      return;
    }
    created.setHandlers({
      onPick: begin,
      onFocus,
      onDigit,
      onBackspace,
      onSubmit,
      onNext,
      onReplay,
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
    console.error('[mahjong-score] PixiJS 场景初始化失败', error);
    sceneError.value = '画面加载失败，请刷新后重试';
  }
});

function fitScene(hostEl: HTMLElement) {
  const question = currentQuestion();
  const fields = question ? 2 + (question.winType === 'ron' || question.dealer ? 1 : 2) : 4;
  const width = ScoreScene.fitWidth(
    Math.min(420, hostEl.clientWidth || 320),
    hostEl.clientHeight,
    phase.value,
    fields,
  );
  scene.value?.resize(width);
}

watch(sceneState, (state) => {
  scene.value?.setState(state);
  const hostEl = host.value;
  if (hostEl) fitScene(hostEl);
});

onBeforeUnmount(() => {
  disposed = true;
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  observer?.disconnect();
  scene.value?.destroy();
  scene.value = null;
});
</script>

<template>
  <div class="score">
    <div ref="host" class="stage">
      <canvas ref="canvas"></canvas>
    </div>
    <p v-if="sceneError" class="error">{{ sceneError }}</p>
  </div>
</template>

<style scoped>
.score {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stage {
  flex: 0 1 auto;
  align-self: center;
  width: 100%;
  max-width: 420px;
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
