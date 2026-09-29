<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useAuthStore } from '@game-life/platform-web';
import { bingoRoutes } from '../routes.js';
import type { BingoRoomView } from './api.js';
import { drawBingoRoom, fetchBingoRoom, startBingoRoom } from './api.js';

const route = useRoute();
const auth = useAuthStore();

const code = computed(() => String(route.params.code ?? '').toUpperCase());
const room = ref<BingoRoomView | null>(null);
const error = ref('');
const loading = ref(true);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const isHost = computed(
  () => !!room.value && !!auth.userId && room.value.hostUserId === auth.userId,
);

async function refresh() {
  if (!code.value) return;
  try {
    room.value = await fetchBingoRoom(code.value);
    error.value = '';
  } catch (e: unknown) {
    const msg =
      e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
    error.value = msg ?? '加载失败';
  } finally {
    loading.value = false;
  }
}

async function onStart() {
  if (!code.value) return;
  try {
    room.value = await startBingoRoom(code.value);
  } catch (e: unknown) {
    const msg =
      e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
    error.value = msg ?? '开始失败';
  }
}

async function onDraw() {
  if (!code.value) return;
  try {
    room.value = await drawBingoRoom(code.value);
  } catch (e: unknown) {
    const msg =
      e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
    error.value = msg ?? '开奖失败';
  }
}

function cellLabel(itemId: number) {
  return room.value?.itemLabels[itemId] ?? '?';
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
  <div class="page room">
    <RouterLink :to="bingoRoutes.roomLobbyPath" class="back">← 房间列表</RouterLink>

    <header v-if="room" class="room__head">
      <div>
        <p class="code">房间 {{ room.code }}</p>
        <p class="status">
          {{
            room.status === 'waiting'
              ? '等待中'
              : room.status === 'playing'
                ? '进行中'
                : '已结束'
          }}
        </p>
      </div>
    </header>

    <p v-if="loading && !room" class="muted">加载中…</p>
    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="room" class="players">
      <h2>玩家（{{ room.players.length }}/8）</h2>
      <ul>
        <li v-for="p in room.players" :key="p.userId">
          <span>{{ p.username }}</span>
          <span class="role">{{ p.role === 'host' ? '房主' : '玩家' }}</span>
        </li>
      </ul>
    </section>

    <div v-if="room?.status === 'waiting' && isHost" class="actions">
      <button type="button" class="btn" @click="onStart">开始游戏</button>
      <p class="hint">你是房主，人满后点击开始（至少 1 人）</p>
    </div>
    <p v-else-if="room?.status === 'waiting'" class="hint">等待房主开始…</p>

    <section v-if="room && room.status !== 'waiting'" class="draws">
      <h2>已揭晓</h2>
      <div class="draw-chips">
        <span v-for="id in room.drawnItemIds" :key="id" class="chip">{{ cellLabel(id) }}</span>
      </div>
      <p v-if="room.currentItemId != null" class="current">
        本轮：<strong>{{ cellLabel(room.currentItemId) }}</strong>
      </p>
    </section>

    <div v-if="room?.status === 'playing' && isHost" class="actions">
      <button type="button" class="btn" @click="onDraw">揭晓下一个图案</button>
    </div>

    <section v-if="room?.myBoard && room.myMarked" class="board-wrap">
      <h2>我的格子（{{ auth.username }}）</h2>
      <div class="board">
        <div
          v-for="(itemId, idx) in room.myBoard"
          :key="idx"
          class="cell"
          :class="{ 'cell--marked': room.myMarked[idx] }"
        >
          {{ cellLabel(itemId) }}
        </div>
      </div>
    </section>

    <div v-if="room?.winner" class="winner">
      🎉 获胜：{{ room.winner.username }}
    </div>
  </div>
</template>

<style scoped>
.back {
  font-size: 14px;
  display: inline-block;
  margin-bottom: 12px;
}
.code {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.status {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 14px;
}
.players h2,
.draws h2,
.board-wrap h2 {
  font-size: 15px;
  color: var(--muted);
  margin: 20px 0 10px;
}
.players ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.players li {
  display: flex;
  justify-content: space-between;
  background: var(--surface);
  padding: 10px 14px;
  border-radius: var(--radius);
}
.role {
  font-size: 13px;
  color: var(--accent);
}
.actions {
  margin-top: 16px;
}
.actions .btn {
  width: 100%;
}
.hint {
  font-size: 13px;
  color: var(--muted);
  margin-top: 8px;
}
.draw-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  background: var(--surface);
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 20px;
}
.current {
  margin-top: 12px;
}
.board {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}
.cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  border-radius: 8px;
  font-size: clamp(18px, 5vw, 26px);
  opacity: 0.45;
}
.cell--marked {
  opacity: 1;
  box-shadow: 0 0 0 2px var(--accent);
  background: #1e3a5f;
}
.winner {
  margin-top: 24px;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  color: #4ade80;
}
.muted {
  color: var(--muted);
}
</style>
