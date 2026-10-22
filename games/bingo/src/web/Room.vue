<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@game-life/platform-web';
import type { BingoRoomView } from './api.js';
import { drawBingoRoom, fetchBingoRoom } from './api.js';
import BingoBoard from './BingoBoard.vue';

const route = useRoute();
const auth = useAuthStore();

const code = computed(() => String(route.params.code ?? '').toUpperCase());
const room = ref<BingoRoomView | null>(null);
const error = ref('');
const loading = ref(true);
const drawing = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const isHost = computed(
  () => !!room.value && !!auth.userId && room.value.hostUserId === auth.userId,
);

const statusText = computed(() => {
  if (!room.value) return '';
  if (room.value.status === 'playing') return '进行中';
  return room.value.status === 'finished' ? '本局结束' : '等待中';
});

async function refresh() {
  if (!code.value) return;
  try {
    room.value = await fetchBingoRoom(code.value);
    error.value = '';
  } catch (e: unknown) {
    error.value = messageOf(e) ?? '加载失败';
  } finally {
    loading.value = false;
  }
}

async function onDraw() {
  if (!code.value || drawing.value) return;
  drawing.value = true;
  try {
    room.value = await drawBingoRoom(code.value);
  } catch (e: unknown) {
    error.value = messageOf(e) ?? '开奖失败';
  } finally {
    drawing.value = false;
  }
}

function messageOf(e: unknown) {
  if (e && typeof e === 'object' && 'response' in e) {
    return (e as { response?: { data?: { message?: string } } }).response?.data?.message;
  }
  return undefined;
}

onMounted(() => {
  refresh();
  pollTimer = setInterval(refresh, 2000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div class="room">
    <p v-if="loading && !room" class="muted">加载中…</p>
    <p v-if="error" class="error">{{ error }}</p>

    <template v-if="room">
      <div class="room__bar">
        <span class="pill" :class="`pill--${room.status}`">{{ statusText }}</span>
        <ul class="players">
          <li
            v-for="p in room.players"
            :key="p.userId"
            class="player"
            :class="{
              'player--me': p.userId === auth.userId,
              'player--winner': room.winner?.userId === p.userId,
            }"
          >
            <span class="player__dot" aria-hidden="true"></span>
            <span class="player__name">{{ p.username }}</span>
            <span v-if="p.role === 'host'" class="player__tag">房主</span>
          </li>
        </ul>
      </div>

      <BingoBoard v-if="room.myBoard" :room="room" />

      <div v-if="room.status === 'playing' && isHost" class="actions">
        <button type="button" class="btn" :disabled="drawing" @click="onDraw">
          {{ drawing ? '揭晓中…' : '揭晓下一个图案' }}
        </button>
      </div>
      <p v-else-if="room.status === 'playing'" class="waiting">等待房主开奖…</p>

      <div v-if="room.winner" class="winner-card">
        <span class="winner-card__crown" aria-hidden="true">👑</span>
        <div>
          <p class="winner-card__title">{{ room.winner.username }} 连成一线！</p>
          <p class="winner-card__sub">本局结束，房主可退出本局再来一盘</p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.room__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.pill {
  flex: none;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.12);
  color: var(--accent);
}

.pill--finished {
  background: rgba(74, 222, 128, 0.12);
  color: #4ade80;
}

.pill--waiting {
  background: rgba(148, 163, 184, 0.12);
  color: var(--muted);
}

.players {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
}

.player {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface);
  font-size: 13px;
  color: #cfe3f7;
}

.player__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3f5b78;
}

.player--me .player__dot {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent);
}

.player--winner {
  color: #fde68a;
  background: rgba(251, 191, 36, 0.12);
}

.player--winner .player__dot {
  background: #fbbf24;
  box-shadow: 0 0 6px #fbbf24;
}

.player__tag {
  font-size: 11px;
  color: var(--accent);
}

.actions {
  margin-top: 16px;
}

.actions .btn {
  width: 100%;
}

.waiting {
  margin: 16px 0 0;
  text-align: center;
  font-size: 14px;
  color: var(--muted);
}

.winner-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.16), rgba(56, 189, 248, 0.1));
  border: 1px solid rgba(251, 191, 36, 0.35);
}

.winner-card__crown {
  font-size: 26px;
}

.winner-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #fde68a;
}

.winner-card__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.muted {
  color: var(--muted);
}
</style>
