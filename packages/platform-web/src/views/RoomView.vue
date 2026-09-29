<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, provide, ref, shallowRef, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import {
  fetchRoom,
  finishRoom,
  leaveRoom,
  resetRoom,
  selectRoomGame,
  startRoom,
  type RoomView,
} from '../api/rooms.js';
import { getWebGameById, listWebGames } from '../games/registry.js';
import { ROOM_PLAY_KEY } from '../room/playKey.js';
import { useAuthStore } from '../stores/auth.js';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const code = computed(() => String(route.params.code ?? '').toUpperCase());
const room = ref<RoomView | null>(null);
const error = ref('');
const games = listWebGames();
const playComponent = shallowRef<ReturnType<typeof defineAsyncComponent> | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

const isHost = computed(() => !!room.value && room.value.hostUserId === auth.userId);
const selectedGame = computed(() => (room.value?.gameId ? getWebGameById(room.value.gameId) : undefined));

const canStart = computed(() => {
  const current = room.value;
  const game = selectedGame.value;
  if (!current || !game || current.status !== 'waiting') return false;
  return current.playerCount >= game.minPlayers && current.playerCount <= game.maxPlayers;
});

async function refresh() {
  if (!code.value) return;
  try {
    room.value = await fetchRoom(code.value);
    error.value = '';
  } catch (e: unknown) {
    error.value = messageOf(e) ?? '房间不存在';
  }
}

function messageOf(e: unknown) {
  if (e && typeof e === 'object' && 'response' in e) {
    return (e as { response?: { data?: { message?: string } } }).response?.data?.message;
  }
  return undefined;
}

async function onSelect(gameId: string) {
  if (!gameId || gameId === room.value?.gameId) return;
  error.value = '';
  try {
    room.value = await selectRoomGame(code.value, gameId);
  } catch (e: unknown) {
    error.value = messageOf(e) ?? '无法选择该游戏';
  }
}

async function onStart() {
  error.value = '';
  try {
    room.value = await startRoom(code.value);
  } catch (e: unknown) {
    error.value = messageOf(e) ?? '无法开始';
  }
}

async function onExitGame() {
  error.value = '';
  try {
    room.value = await resetRoom(code.value);
  } catch (e: unknown) {
    error.value = messageOf(e) ?? '无法退出本局';
  }
}

async function onLeave() {
  await leaveRoom();
  await router.push({ name: 'lobby' });
}

provide(ROOM_PLAY_KEY, {
  get code() {
    return code.value;
  },
  async complete() {
    room.value = await finishRoom(code.value);
  },
});

watch(
  () => (room.value?.status === 'waiting' ? '' : (room.value?.gameId ?? '')),
  (gameId) => {
    if (!gameId) {
      playComponent.value = null;
      return;
    }
    const game = getWebGameById(gameId);
    playComponent.value = game?.loadPlay
      ? defineAsyncComponent(game.loadPlay as () => Promise<{ default: object }>)
      : null;
  },
);

onMounted(() => {
  refresh();
  timer = setInterval(refresh, 2000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="page room">
    <header class="room__top">
      <RouterLink to="/" class="back">← 房间列表</RouterLink>
      <button type="button" class="btn btn--ghost" @click="onLeave">离开</button>
    </header>

    <template v-if="room">
      <h1>房间 {{ room.code }}</h1>
      <p class="sub">
        {{ room.status === 'waiting' ? '等待中' : room.status === 'playing' ? '对局中' : '本局已结束' }}
        · {{ room.playerCount }} 人
        <span v-if="room.gameName"> · {{ room.gameName }}</span>
      </p>

      <template v-if="room.status === 'waiting'">
        <section>
          <h2>玩家</h2>
          <ul class="players">
            <li v-for="player in room.players" :key="player.userId">
              <span>{{ player.username }}</span>
              <span class="role">{{ player.role === 'host' ? '房主' : '玩家' }}</span>
            </li>
          </ul>
        </section>

        <section v-if="isHost">
          <h2>选择游戏</h2>
          <select class="game-select" :value="room.gameId ?? ''" @change="onSelect(($event.target as HTMLSelectElement).value)">
            <option value="" disabled>请选择游戏</option>
            <option v-for="game in games" :key="game.id" :value="game.id">
              {{ game.name }}（{{ game.minPlayers }}–{{ game.maxPlayers }} 人）
            </option>
          </select>
          <p v-if="selectedGame && !canStart" class="hint">
            「{{ selectedGame.name }}」需要 {{ selectedGame.minPlayers }}–{{ selectedGame.maxPlayers }} 人，当前
            {{ room.playerCount }} 人
          </p>
          <button type="button" class="btn start" :disabled="!canStart" @click="onStart">开始游戏</button>
        </section>
        <p v-else class="hint">
          {{ room.gameName ? `当前游戏：${room.gameName}，等待房主开始` : '等待房主选择游戏' }}
        </p>
      </template>

      <template v-else-if="room.status === 'finished'">
        <component :is="playComponent" v-if="playComponent" />
        <button type="button" class="btn start" @click="onExitGame">退出游戏</button>
      </template>

      <component :is="playComponent" v-else-if="playComponent" />
    </template>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.room__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.back {
  font-size: 14px;
}
h1 {
  margin: 0;
  font-size: 24px;
  letter-spacing: 0.04em;
}
.sub,
.hint {
  color: var(--muted);
  font-size: 14px;
}
h2 {
  margin: 18px 0 8px;
  font-size: 14px;
  color: var(--muted);
}
.players {
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
  border-radius: var(--radius);
  padding: 10px 14px;
}
.role {
  color: var(--accent);
  font-size: 13px;
}
.game-select {
  width: 100%;
  min-height: var(--touch-min);
  padding: 0 12px;
  border-radius: var(--radius);
  border: 1px solid #334155;
  background: var(--surface);
  color: var(--text);
}
.start {
  width: 100%;
  margin-top: 14px;
}
</style>
