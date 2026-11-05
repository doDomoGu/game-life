<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ROOM_PLAY_KEY, useAuthStore, type RoomPlayContext } from '@game-life/platform-web';
import { colorAt, GUESS_COLORS } from '../colors.js';
import type { ColorGuessConfig, ColorGuessMode, ColorGuessView } from '../view.js';
import {
  fetchColorGuessRoom,
  setColorGuessSecret,
  startColorGuess,
  submitColorGuess,
  updateColorGuessConfig,
} from './api.js';

const play = inject<RoomPlayContext | null>(ROOM_PLAY_KEY, null);
const auth = useAuthStore();
const code = computed(() => play?.code ?? '');

const view = ref<ColorGuessView | null>(null);
const error = ref('');
const loading = ref(true);
const busy = ref(false);
const draft = ref<Array<number | null>>([null, null, null, null]);
const activeSlot = ref(0);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const me = computed(() => auth.userId);
const config = computed<ColorGuessConfig>(
  () =>
    view.value?.config ?? {
      mode: 'solo',
      paletteSize: 8,
      allowDuplicates: false,
      setterChoice: 'random',
    },
);
const isSolo = computed(() => (view.value?.players.length ?? 1) === 1);
const canConfig = computed(() => view.value?.canConfig === true);
const isSetter = computed(() => view.value?.youRole === 'setter');
const palette = computed(() => GUESS_COLORS.slice(0, config.value.paletteSize));
const otherPlayer = computed(
  () => view.value?.players.find((player) => player.userId !== me.value) ?? null,
);
const myBoard = computed(() =>
  view.value && me.value ? (view.value.boards[me.value] ?? null) : null,
);
const guesserBoard = computed(() =>
  view.value?.guesserId ? (view.value.boards[view.value.guesserId] ?? null) : null,
);
const displayBoard = computed(() =>
  view.value?.config.mode === 'setter' && isSetter.value ? guesserBoard.value : myBoard.value,
);
const opponentBoard = computed(() =>
  view.value && otherPlayer.value
    ? (view.value.boards[otherPlayer.value.userId] ?? null)
    : null,
);
const canGuess = computed(() => {
  const current = view.value;
  if (!current || current.phase !== 'guessing') return false;
  return current.config.mode === 'setter'
    ? current.guesserId === me.value
    : current.turnUserId === me.value;
});
const draftComplete = computed(() => draft.value.every((value) => value !== null));
const attemptsLeft = computed(() =>
  Math.max(
    0,
    (view.value?.attemptLimit ?? 10) - (displayBoard.value?.attempts.length ?? 0),
  ),
);
const modeLabel = computed(() => {
  if (config.value.mode === 'solo') return '单人解题';
  if (config.value.mode === 'race') return '双人竞速';
  return '双人出题';
});
const phaseLabel = computed(() => {
  if (!view.value) return '';
  if (view.value.phase === 'setup') return '配置中';
  if (view.value.phase === 'setter') return '出题中';
  if (view.value.phase === 'guessing') return '进行中';
  return '已结束';
});
const resultText = computed(() => {
  const current = view.value;
  if (!current || current.phase !== 'finished') return '';
  if (current.result === 'draw') return '平局';
  if (!current.winnerId) return '没有猜中';
  if (current.winnerId === me.value) return '你赢了';
  const winner = current.players.find((player) => player.userId === current.winnerId);
  return `${winner?.username ?? '对方'} 获胜`;
});
const secretColors = computed(() =>
  (view.value?.secret ?? []).filter((value) => value >= 0),
);
const modeOptions = computed<Array<{ id: ColorGuessMode; label: string; hint: string }>>(() =>
  isSolo.value
    ? [{ id: 'solo', label: '单人解题', hint: '系统出题' }]
    : [
        { id: 'race', label: '双人竞速', hint: '系统出题，轮流猜' },
        { id: 'setter', label: '双人出题', hint: '一人出题一人猜' },
      ],
);
const setterChoiceLabel = computed(() => {
  if (config.value.setterChoice === 'random') return '随机';
  if (config.value.setterChoice === me.value) return '我';
  return otherPlayer.value?.username ?? '对方';
});

function messageOf(e: unknown) {
  if (e && typeof e === 'object' && 'response' in e) {
    return (e as { response?: { data?: { message?: string } } }).response?.data?.message;
  }
  return undefined;
}

function resetDraft() {
  draft.value = [null, null, null, null];
  activeSlot.value = 0;
}

async function refresh() {
  if (!code.value) return;
  try {
    view.value = await fetchColorGuessRoom(code.value);
    error.value = '';
  } catch (e: unknown) {
    error.value = messageOf(e) ?? '加载对局失败';
  } finally {
    loading.value = false;
  }
}

async function run(action: () => Promise<ColorGuessView>) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    view.value = await action();
    resetDraft();
  } catch (e: unknown) {
    error.value = messageOf(e) ?? '操作失败';
  } finally {
    busy.value = false;
  }
}

async function onConfig(patch: Partial<ColorGuessConfig>) {
  if (!canConfig.value) return;
  await run(() => updateColorGuessConfig(code.value, patch));
}

async function onStart() {
  await run(() => startColorGuess(code.value));
}

async function onSecret() {
  if (!draftComplete.value) return;
  await run(() => setColorGuessSecret(code.value, draft.value as number[]));
}

async function onGuess() {
  if (!draftComplete.value) return;
  await run(() => submitColorGuess(code.value, draft.value as number[]));
}

function selectSlot(index: number) {
  activeSlot.value = index;
}

function colorUsedElsewhere(color: number) {
  return draft.value.some((value, index) => value === color && index !== activeSlot.value);
}

function colorDisabled(color: number) {
  if (busy.value) return true;
  if (view.value?.phase !== 'setter' || config.value.allowDuplicates) return false;
  return colorUsedElsewhere(color);
}

function clearSlot(index = activeSlot.value) {
  if (busy.value) return;
  draft.value[index] = null;
  activeSlot.value = index;
}

function pickColor(color: number) {
  if (colorDisabled(color)) return;
  const current = draft.value[activeSlot.value];
  if (current === color) {
    clearSlot();
    return;
  }
  draft.value[activeSlot.value] = color;
  if (current !== null) return;
  const next = draft.value.findIndex((value, index) => index > activeSlot.value && value === null);
  if (next >= 0) activeSlot.value = next;
}

watch(
  () =>
    `${view.value?.phase}|${view.value?.turnUserId}|${config.value.paletteSize}|${config.value.allowDuplicates}`,
  resetDraft,
);

onMounted(() => {
  refresh();
  pollTimer = setInterval(refresh, 1000);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div class="cg">
    <p v-if="loading && !view" class="muted">加载对局中…</p>
    <p v-if="error" class="error">{{ error }}</p>

    <template v-if="view">
      <header class="cg-head">
        <span class="pill" :class="`pill--${view.phase}`">{{ phaseLabel }}</span>
        <span class="meta">
          {{ modeLabel }} · {{ config.paletteSize }} 色 ·
          {{ config.allowDuplicates ? '密码可重复' : '密码不重复' }}
        </span>
      </header>

      <section v-if="view.phase === 'setup'" class="panel">
        <template v-if="canConfig">
          <div class="field">
            <span class="field__label">玩法</span>
            <div class="choices choices--mode">
              <button
                v-for="option in modeOptions"
                :key="option.id"
                type="button"
                class="choice"
                :class="{ 'choice--active': config.mode === option.id }"
                :disabled="busy"
                @click="onConfig({ mode: option.id })"
              >
                <strong>{{ option.label }}</strong>
                <small>{{ option.hint }}</small>
              </button>
            </div>
          </div>

          <div class="field">
            <span class="field__label">可猜颜色</span>
            <div class="choices choices--inline">
              <button
                type="button"
                class="choice choice--small"
                :class="{ 'choice--active': config.paletteSize === 8 }"
                :disabled="busy"
                @click="onConfig({ paletteSize: 8 })"
              >
                8 种
              </button>
              <button
                type="button"
                class="choice choice--small"
                :class="{ 'choice--active': config.paletteSize === 10 }"
                :disabled="busy"
                @click="onConfig({ paletteSize: 10 })"
              >
                10 种 <small>更难</small>
              </button>
            </div>
          </div>

          <div class="field">
            <span class="field__label">密码是否重复</span>
            <div class="choices choices--inline">
              <button
                type="button"
                class="choice choice--small"
                :class="{ 'choice--active': !config.allowDuplicates }"
                :disabled="busy"
                @click="onConfig({ allowDuplicates: false })"
              >
                密码不重复
              </button>
              <button
                type="button"
                class="choice choice--small"
                :class="{ 'choice--active': config.allowDuplicates }"
                :disabled="busy"
                @click="onConfig({ allowDuplicates: true })"
              >
                密码可重复 <small>更难</small>
              </button>
            </div>
            <p class="hint">只约束密码本身。猜测时可以重复填同一颜色，用来排除。</p>
          </div>

          <div v-if="!isSolo && config.mode === 'setter'" class="field">
            <span class="field__label">出题者</span>
            <div class="choices choices--inline">
              <button
                type="button"
                class="choice choice--small"
                :class="{ 'choice--active': config.setterChoice === me }"
                :disabled="busy"
                @click="onConfig({ setterChoice: me ?? 'random' })"
              >
                我出题
              </button>
              <button
                v-if="otherPlayer"
                type="button"
                class="choice choice--small"
                :class="{ 'choice--active': config.setterChoice === otherPlayer.userId }"
                :disabled="busy"
                @click="onConfig({ setterChoice: otherPlayer.userId })"
              >
                对方出题
              </button>
              <button
                type="button"
                class="choice choice--small"
                :class="{ 'choice--active': config.setterChoice === 'random' }"
                :disabled="busy"
                @click="onConfig({ setterChoice: 'random' })"
              >
                随机
              </button>
            </div>
          </div>

          <button type="button" class="primary" :disabled="busy" @click="onStart">
            开始对局
          </button>
        </template>
        <template v-else>
          <p class="wait-title">等待房主配置</p>
          <p class="hint">
            {{ modeLabel }} · {{ config.paletteSize }} 色 ·
            {{ config.allowDuplicates ? '密码可重复' : '密码不重复' }}
            <template v-if="!isSolo && config.mode === 'setter'">
              · 出题者：{{ setterChoiceLabel }}
            </template>
          </p>
        </template>
      </section>

      <section v-else-if="view.phase === 'setter'" class="panel">
        <template v-if="isSetter">
          <p class="wait-title">设置 4 位颜色密码</p>
          <p class="hint">
            对方看不到你设置的内容；{{
              config.allowDuplicates ? '密码可以重复颜色' : '密码不能重复颜色'
            }}。
          </p>
          <div class="slots">
            <button
              v-for="(value, index) in draft"
              :key="index"
              type="button"
              class="slot"
              :class="{ 'slot--active': index === activeSlot }"
              @click="selectSlot(index)"
            >
              <span
                v-if="value !== null"
                class="peg"
                role="img"
                :aria-label="colorAt(value)?.name"
                :title="colorAt(value)?.name"
                :style="{ background: colorAt(value)?.hex }"
              ></span>
              <span v-else class="slot__empty">?</span>
            </button>
          </div>
          <div class="palette">
            <button
              v-for="(color, index) in palette"
              :key="color.name"
              type="button"
              class="swatch"
              :aria-label="color.name"
              :title="color.name"
              :class="{ 'swatch--current': draft[activeSlot] === index }"
              :style="{ background: color.hex }"
              :disabled="colorDisabled(index)"
              @click="pickColor(index)"
            ></button>
          </div>
          <div class="actions">
            <button type="button" class="ghost" :disabled="busy" @click="clearSlot()">清空此格</button>
            <button type="button" class="ghost" :disabled="busy" @click="resetDraft">全部清空</button>
            <button
              type="button"
              class="primary"
              :disabled="!draftComplete || busy"
              @click="onSecret"
            >
              确认密码
            </button>
          </div>
        </template>
        <template v-else>
          <p class="wait-title">对方正在设置密码…</p>
          <p class="hint">出题完成后轮到你猜，最多猜 10 次。</p>
        </template>
      </section>

      <template v-else>
        <section v-if="view.phase === 'guessing'" class="turn">
          <span v-if="canGuess" class="turn--me">轮到你</span>
          <span v-else>等待对方</span>
          <span class="turn__left">剩余 {{ attemptsLeft }} 次</span>
        </section>

        <section v-if="secretColors.length" class="panel secret">
          <span class="field__label">{{ isSetter ? '你设置的密码' : '密码' }}</span>
          <div class="pegs">
            <span
              v-for="(value, index) in secretColors"
              :key="index"
              class="peg"
              role="img"
              :aria-label="colorAt(value)?.name"
              :title="colorAt(value)?.name"
              :style="{ background: colorAt(value)?.hex }"
            ></span>
          </div>
        </section>

        <section v-if="displayBoard" class="board">
          <header class="board__head">
            <span>
              {{ view.config.mode === 'setter' && isSetter ? '答题者记录' : '我的记录' }}
            </span>
            <span class="hint">{{ displayBoard.attempts.length }} / {{ view.attemptLimit }}</span>
          </header>
          <p v-if="displayBoard.attempts.length === 0" class="hint">还没有猜测</p>
          <div
            v-for="(attempt, index) in displayBoard.attempts"
            :key="index"
            class="attempt"
          >
            <span class="attempt__no">{{ index + 1 }}</span>
            <span class="pegs">
              <span
                v-for="(value, colorIndex) in attempt.colors"
                :key="colorIndex"
                class="peg peg--small"
                role="img"
                :aria-label="colorAt(value)?.name"
                :title="colorAt(value)?.name"
                :style="{ background: colorAt(value)?.hex }"
              ></span>
            </span>
            <span class="feedback">
              <span class="fb fb--exact">全对 {{ attempt.exact }}</span>
              <span class="fb fb--partial">半对 {{ attempt.partial }}</span>
            </span>
          </div>
        </section>

        <p v-if="view.phase === 'guessing' && view.config.mode === 'race' && opponentBoard" class="hint">
          对方：已猜 {{ opponentBoard.attempts.length }} / {{ view.attemptLimit }} 次{{
            opponentBoard.solved ? ' · 已猜中' : ''
          }}
        </p>

        <section v-if="canGuess" class="panel">
          <p class="field__label">
            第 {{ (myBoard?.attempts.length ?? 0) + 1 }} 次猜测
          </p>
          <p class="hint">
            点格子再点色块填入或换色；「清空此格」只擦当前格。猜测可以重复颜色。
          </p>
          <div class="slots">
            <button
              v-for="(value, index) in draft"
              :key="index"
              type="button"
              class="slot"
              :class="{ 'slot--active': index === activeSlot }"
              @click="selectSlot(index)"
            >
              <span
                v-if="value !== null"
                class="peg"
                role="img"
                :aria-label="colorAt(value)?.name"
                :title="colorAt(value)?.name"
                :style="{ background: colorAt(value)?.hex }"
              ></span>
              <span v-else class="slot__empty">?</span>
            </button>
          </div>
          <div class="palette">
            <button
              v-for="(color, index) in palette"
              :key="color.name"
              type="button"
              class="swatch"
              :aria-label="color.name"
              :title="color.name"
              :class="{ 'swatch--current': draft[activeSlot] === index }"
              :style="{ background: color.hex }"
              :disabled="colorDisabled(index)"
              @click="pickColor(index)"
            ></button>
          </div>
          <div class="actions">
            <button type="button" class="ghost" :disabled="busy" @click="clearSlot()">清空此格</button>
            <button type="button" class="ghost" :disabled="busy" @click="resetDraft">全部清空</button>
            <button
              type="button"
              class="primary"
              :disabled="!draftComplete || busy"
              @click="onGuess"
            >
              提交猜测
            </button>
          </div>
        </section>

        <section v-if="view.phase === 'finished'" class="result">
          <h3>{{ resultText }}</h3>
          <p v-if="secretColors.length" class="hint">
            正确密码：
            <span
              v-for="(value, index) in secretColors"
              :key="index"
              class="peg peg--small"
              role="img"
              :aria-label="colorAt(value)?.name"
              :title="colorAt(value)?.name"
              :style="{ background: colorAt(value)?.hex }"
            ></span>
          </p>
          <p class="hint">本局已结束，等待房间结算。</p>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.cg {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 2px 0 12px;
}
.cg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.pill {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.pill--guessing {
  color: #4ade80;
}
.pill--finished {
  color: var(--accent);
}
.meta {
  color: var(--muted);
  font-size: 12px;
  text-align: right;
}
.panel {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.field__label {
  color: var(--muted);
  font-size: 12px;
}
.choices {
  display: grid;
  gap: 8px;
}
.choices--mode {
  grid-template-columns: 1fr 1fr;
}
.choices--inline {
  display: flex;
  flex-wrap: wrap;
}
.choice {
  min-height: 44px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #334155;
  background: rgba(15, 23, 42, 0.4);
  color: var(--text);
  font: inherit;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
}
.choice small {
  color: var(--muted);
  font-size: 11px;
}
.choice--small {
  align-items: center;
  min-height: 36px;
  padding: 4px 12px;
  flex-direction: row;
  gap: 4px;
  font-size: 13px;
}
.choice--active {
  border-color: var(--accent);
  background: rgba(56, 189, 248, 0.14);
}
.choice:disabled {
  opacity: 0.55;
}
.primary,
.ghost {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid transparent;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.primary {
  width: 100%;
  background: var(--accent);
  color: #0f172a;
}
.ghost {
  padding: 0 16px;
  background: transparent;
  border-color: #334155;
  color: var(--text);
}
.primary:disabled,
.ghost:disabled {
  opacity: 0.45;
}
.hint {
  color: var(--muted);
  font-size: 12px;
  margin: 6px 0 0;
}
.wait-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}
.slots {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.slot {
  min-height: 52px;
  border-radius: 10px;
  border: 1px solid #334155;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.slot--active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
}
.slot__empty {
  color: #475569;
  font-size: 20px;
}
.palette {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.swatch {
  min-height: 40px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  cursor: pointer;
}
.swatch:disabled {
  opacity: 0.28;
}
.swatch--current {
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--accent);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.actions .primary {
  flex: 1;
}
.pegs {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}
.peg {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  flex: none;
}
.peg--small {
  width: 24px;
  height: 24px;
  font-size: 11px;
}
.turn {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--surface);
  font-size: 14px;
}
.turn--me {
  color: #4ade80;
  font-weight: 700;
}
.turn__left {
  color: var(--muted);
  font-size: 12px;
}
.board {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 10px 12px;
}
.board__head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 6px;
}
.attempt {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 6px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.attempt:first-of-type {
  border-top: none;
}
.attempt__no {
  color: var(--muted);
  font-size: 12px;
}
.feedback {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.fb {
  font-size: 11px;
  border-radius: 6px;
  padding: 2px 6px;
  white-space: nowrap;
}
.fb--exact {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.12);
}
.fb--partial {
  color: #facc15;
  background: rgba(250, 204, 21, 0.12);
}
.result {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 14px;
}
.result h3 {
  margin: 0 0 8px;
  font-size: 20px;
}
.error {
  color: var(--danger);
  font-size: 13px;
  margin: 0;
}
.muted {
  color: var(--muted);
  font-size: 13px;
}
</style>
