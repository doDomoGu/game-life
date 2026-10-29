<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  createGameSocket,
  ROOM_PLAY_KEY,
  useAuthStore,
  type ConnectionState,
  type GameSocket,
  type RoomPlayContext,
} from '@game-life/platform-web';
import { PEN_COLORS, type PenColor } from '../constants.js';
import type { DrawGuessView, StrokeView } from '../view.js';

const play = inject<RoomPlayContext | null>(ROOM_PLAY_KEY, null);
const auth = useAuthStore();
const code = computed(() => play?.code ?? '');

const view = ref<DrawGuessView | null>(null);
const error = ref('');
const connection = ref<ConnectionState>('connecting');
const color = ref<PenColor>(PEN_COLORS[0]);
const tool = ref<'pen' | 'eraser'>('pen');
const guessText = ref('');
const clock = ref(Date.now());
const offset = ref(0);
const canvasEl = ref<HTMLCanvasElement | null>(null);

let socket: GameSocket | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let draft: StrokeView | null = null;
let drawing = false;

const myId = computed(() => auth.userId ?? '');
const isDrawer = computed(() => view.value?.drawerId === myId.value);
const me = computed(() => view.value?.players.find((player) => player.userId === myId.value) ?? null);
const drawerName = computed(
  () => view.value?.players.find((player) => player.userId === view.value?.drawerId)?.username ?? '画手',
);
const remaining = computed(() => {
  const current = view.value;
  if (!current || current.phase === 'settlement') return 0;
  void clock.value;
  const serverNow = Date.now() + offset.value;
  return Math.max(0, Math.ceil((current.endsAt - serverNow) / 1000));
});
const phaseLabel = computed(() => {
  if (view.value?.phase === 'reveal') return '本轮得分';
  if (view.value?.phase === 'settlement') return '本局结算';
  return isDrawer.value ? '你来画' : '猜词';
});
const canGuess = computed(
  () => view.value?.phase === 'draw' && !isDrawer.value && me.value?.correct !== true,
);

function send(message: { type: string; payload?: unknown }): void {
  if (!socket?.send(message)) error.value = '连接已断开，正在重连';
}

function syncClock(next: DrawGuessView): void {
  offset.value = next.serverNow - Date.now();
}

watch(
  () => (view.value ? `${view.value.roundIndex}:${view.value.phase}` : ''),
  () => {
    guessText.value = '';
  },
);

watch(view, async (next) => {
  if (next) syncClock(next);
  if (draft && !drawing) {
    const remote = next?.strokes.find((stroke) => stroke.id === draft?.id);
    if (remote && remote.points.length >= draft.points.length) draft = null;
  }
  await nextTick();
  paint();
});

function pointOf(event: PointerEvent): { x: number; y: number } | null {
  const canvas = canvasEl.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

function onPointerDown(event: PointerEvent): void {
  if (!isDrawer.value || view.value?.phase !== 'draw') return;
  const point = pointOf(event);
  if (!point) return;
  drawing = true;
  canvasEl.value?.setPointerCapture(event.pointerId);
  draft = {
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    tool: tool.value,
    color: color.value,
    points: [point],
  };
  send({
    type: 'stroke:start',
    payload: { id: draft.id, tool: draft.tool, color: draft.color, x: point.x, y: point.y },
  });
  paint();
}

function onPointerMove(event: PointerEvent): void {
  if (!drawing || !draft) return;
  const point = pointOf(event);
  if (!point) return;
  const last = draft.points[draft.points.length - 1];
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.004) return;
  draft.points.push(point);
  send({ type: 'stroke:point', payload: { id: draft.id, x: point.x, y: point.y } });
  paint();
}

function onPointerUp(): void {
  drawing = false;
}

function undo(): void {
  send({ type: 'undo' });
}

function clearCanvas(): void {
  send({ type: 'clear' });
}

function onGuessEnter(event: KeyboardEvent): void {
  if (event.isComposing) event.preventDefault();
}

function submitGuess(): void {
  if (!canGuess.value) return;
  const text = guessText.value.trim();
  const expected = view.value?.wordLength ?? 0;
  const chars = [...text];
  if (chars.length !== expected || chars.some((char) => !/[\u4e00-\u9fff]/.test(char))) {
    error.value = `请输入 ${expected} 个汉字`;
    return;
  }
  error.value = '';
  send({ type: 'guess', payload: { text } });
  guessText.value = '';
}

function paint(): void {
  const canvas = canvasEl.value;
  const current = view.value;
  if (!canvas || !current) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const ratio = window.devicePixelRatio || 1;
  const nextWidth = Math.floor(width * ratio);
  const nextHeight = Math.floor(height * ratio);
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);
  const strokes = draft ? [...current.strokes.filter((stroke) => stroke.id !== draft?.id), draft] : current.strokes;
  for (const stroke of strokes) drawStroke(ctx, stroke, width, height);
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeView,
  width: number,
  height: number,
): void {
  if (stroke.points.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = stroke.tool === 'eraser' ? Math.max(18, width * 0.045) : Math.max(3, width * 0.012);
  ctx.strokeStyle = stroke.tool === 'eraser' ? '#f8fafc' : stroke.color;
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  const first = stroke.points[0]!;
  ctx.moveTo(first.x * width, first.y * height);
  if (stroke.points.length === 1) {
    ctx.lineTo(first.x * width + 0.1, first.y * height + 0.1);
  } else {
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x * width, point.y * height);
  }
  ctx.stroke();
  ctx.restore();
}

function scoresOf(roundScores: Record<string, number>, userId: string): number {
  return roundScores[userId] ?? 0;
}

function bubbleText(player: DrawGuessView['players'][number]): string {
  if (!player.bubble) return '';
  if (player.bubble.kind === 'correct') return '✓';
  const until = player.bubble.until ?? 0;
  if (until <= Date.now() + offset.value) return '';
  return `${player.bubble.text ?? ''} ✕`;
}

onMounted(() => {
  clockTimer = setInterval(() => {
    clock.value = Date.now();
    paint();
  }, 200);
  if (!code.value || !auth.token) {
    error.value = '缺少房间信息';
    return;
  }
  socket = createGameSocket({
    path: `/api/games/draw-guess/rooms/${encodeURIComponent(code.value)}/ws`,
    token: auth.token,
    onStatus: (state) => {
      connection.value = state;
      if (state === 'open') error.value = '';
    },
    onMessage: (message) => {
      if (message.type === 'room:update') {
        view.value = message.payload as DrawGuessView;
        return;
      }
      if (message.type === 'error') {
        const payload = message.payload as { message?: string } | undefined;
        error.value = payload?.message ?? '操作失败';
      }
    },
  });
  window.addEventListener('resize', paint);
});

onBeforeUnmount(() => {
  socket?.close();
  socket = null;
  if (clockTimer) clearInterval(clockTimer);
  window.removeEventListener('resize', paint);
});
</script>

<template>
  <div class="draw">
    <p v-if="!view" class="muted">连接对局中…</p>
    <template v-else>
      <header class="bar">
        <div>
          <strong>第 {{ view.roundIndex }} / {{ view.roundCount }} 轮</strong>
          <span class="muted"> · {{ phaseLabel }}</span>
          <span v-if="connection !== 'open'" class="muted"> · {{ connection === 'connecting' ? '连接中' : '已断开' }}</span>
        </div>
        <strong v-if="view.phase !== 'settlement'" class="time">{{ remaining }}s</strong>
      </header>

      <ul class="people">
        <li v-for="player in view.players" :key="player.userId" :class="{ off: !player.connected }">
          <span v-if="bubbleText(player)" class="bubble" :class="{ ok: player.bubble?.kind === 'correct' }">
            {{ bubbleText(player) }}
          </span>
          <span class="avatar">{{ player.username.slice(0, 1) }}</span>
          <span class="name">{{ player.username }}</span>
          <span class="meta">
            {{ player.userId === view.drawerId ? '画手' : `${player.score} 分` }}
            <template v-if="!player.connected"> · 断线</template>
          </span>
        </li>
      </ul>

      <p v-if="isDrawer && view.word && view.phase === 'draw'" class="word">请画：{{ view.word }}</p>
      <p v-else-if="view.phase !== 'draw' && view.word" class="word">答案：{{ view.word }}</p>
      <p v-else class="word">画手：{{ drawerName }}</p>

      <canvas
        ref="canvasEl"
        class="board"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />

      <div v-if="isDrawer && view.phase === 'draw'" class="tools">
        <button
          v-for="item in PEN_COLORS"
          :key="item"
          type="button"
          class="swatch"
          :class="{ on: tool === 'pen' && color === item }"
          :style="{ background: item }"
          @click="tool = 'pen'; color = item"
        />
        <button type="button" class="tool" :class="{ on: tool === 'eraser' }" @click="tool = 'eraser'">橡皮</button>
        <button type="button" class="tool" @click="undo">撤销</button>
        <button type="button" class="tool" @click="clearCanvas">清空</button>
      </div>

      <form v-else-if="view.phase === 'draw'" class="guess" @submit.prevent="submitGuess">
        <input
          v-model="guessText"
          class="guess-input"
          type="text"
          enterkeyhint="send"
          autocomplete="off"
          :placeholder="`输入 ${view.wordLength} 个字`"
          :disabled="!canGuess"
          @keydown.enter="onGuessEnter"
        />
        <button type="submit" class="tool guess-btn" :disabled="!canGuess">猜</button>
      </form>

      <section v-if="view.phase === 'reveal'" class="panel">
        <p v-for="player in view.players" :key="player.userId">
          {{ player.username }} {{ player.roundScore ?? 0 }} 分
          <span v-if="player.userId === view.drawerId">（画手）</span>
        </p>
      </section>

      <section v-if="view.phase === 'settlement'" class="panel">
        <h2>名次</h2>
        <p v-for="row in view.ranking ?? []" :key="row.userId">
          第 {{ row.rank }} 名 {{ row.username }} {{ row.score }} 分
        </p>
        <h2>每一轮</h2>
        <article v-for="round in view.rounds" :key="round.index" class="round">
          <p>第 {{ round.index }} 轮 · {{ round.word }}</p>
          <p v-for="player in view.players" :key="player.userId">
            {{ player.username }}
            <template v-if="player.userId === round.drawerId">（画手）</template>
            {{ scoresOf(round.scores, player.userId) }} 分
          </p>
        </article>
      </section>
    </template>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.draw {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bar,
.tools,
.guess {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.bar {
  justify-content: space-between;
}
.time {
  font-variant-numeric: tabular-nums;
  font-size: 1.25rem;
}
.people {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  list-style: none;
  margin: 0;
  padding: 18px 0 0;
}
.people li {
  position: relative;
  min-width: 64px;
  text-align: center;
}
.people li.off {
  opacity: 0.55;
}
.avatar {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin: 0 auto 4px;
  border-radius: 999px;
  background: var(--surface);
}
.name,
.meta,
.muted {
  color: var(--muted);
  font-size: 12px;
}
.bubble {
  position: absolute;
  left: 50%;
  bottom: 100%;
  transform: translateX(-50%);
  color: var(--danger);
  font-size: 12px;
  white-space: nowrap;
}
.bubble.ok {
  color: #4ade80;
}
.word {
  margin: 0;
  font-weight: 700;
}
.board {
  width: 100%;
  height: min(52vh, 420px);
  border-radius: 12px;
  touch-action: none;
  background: #f8fafc;
}
.swatch,
.tool,
.guess-input {
  min-height: 44px;
  border-radius: 10px;
  border: 2px solid transparent;
}
.swatch {
  width: 44px;
}
.swatch.on,
.tool.on {
  border-color: var(--accent);
}
.tool,
.guess-input {
  background: var(--surface);
  color: var(--text);
}
.guess-input {
  flex: 1;
  min-width: 0;
  padding: 0 12px;
  font-size: 16px;
}
.tool,
.guess-btn {
  padding: 0 12px;
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.round {
  margin-top: 8px;
}
.error {
  color: var(--danger);
}
</style>
