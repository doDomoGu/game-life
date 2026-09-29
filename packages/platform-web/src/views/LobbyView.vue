<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { createRoom, fetchRooms, joinRoom, type RoomView } from '../api/rooms.js';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const router = useRouter();

const mine = ref<RoomView | null>(null);
const waiting = ref<RoomView[]>([]);
const joinCode = ref('');
const error = ref('');
const loading = ref(false);

async function load() {
  const data = await fetchRooms();
  mine.value = data.mine;
  waiting.value = data.waiting.filter((room) => room.code !== data.mine?.code);
}

onMounted(() => {
  load().catch(() => {
    error.value = '房间列表加载失败';
  });
});

function openRoom(code: string) {
  router.push({ name: 'room', params: { code } });
}

async function onCreate() {
  error.value = '';
  loading.value = true;
  try {
    const room = await createRoom();
    openRoom(room.code);
  } catch (e: unknown) {
    error.value = messageOf(e) ?? '创建失败';
  } finally {
    loading.value = false;
  }
}

async function onJoin(code?: string) {
  error.value = '';
  const value = (code ?? joinCode.value).trim().toUpperCase();
  if (!value) {
    error.value = '请输入房间号';
    return;
  }
  loading.value = true;
  try {
    const room = await joinRoom(value);
    openRoom(room.code);
  } catch (e: unknown) {
    error.value = messageOf(e) ?? '加入失败';
  } finally {
    loading.value = false;
  }
}

function messageOf(e: unknown) {
  if (e && typeof e === 'object' && 'response' in e) {
    return (e as { response?: { data?: { message?: string } } }).response?.data?.message;
  }
  return undefined;
}

function logout() {
  auth.logout();
  router.push({ name: 'login' });
}

function statusLabel(room: RoomView) {
  if (!room.gameName) return '未选游戏';
  return room.gameName;
}
</script>

<template>
  <div class="page lobby">
    <header class="lobby__top">
      <div>
        <p class="hello">你好，{{ auth.username }}</p>
        <h1>房间</h1>
      </div>
      <button type="button" class="btn btn--ghost lobby__logout" @click="logout">退出</button>
    </header>

    <button type="button" class="btn" style="width: 100%; margin-bottom: 16px" :disabled="loading" @click="onCreate">
      创建房间
    </button>

    <div class="join">
      <input v-model="joinCode" placeholder="输入房间号加入" autocapitalize="characters" />
      <button type="button" class="btn btn--ghost" :disabled="loading" @click="onJoin()">加入</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="mine" class="block">
      <h2>我的房间</h2>
      <button type="button" class="room-row" @click="openRoom(mine.code)">
        <strong>{{ mine.code }}</strong>
        <span>{{ statusLabel(mine) }} · {{ mine.playerCount }} 人</span>
      </button>
    </section>

    <section class="block">
      <h2>等待中的房间</h2>
      <p v-if="waiting.length === 0" class="muted">还没有等待中的房间</p>
      <ul v-else class="list">
        <li v-for="room in waiting" :key="room.code">
          <button type="button" class="room-row" @click="onJoin(room.code)">
            <strong>{{ room.code }}</strong>
            <span>{{ statusLabel(room) }} · {{ room.playerCount }}{{ room.maxPlayers ? `/${room.maxPlayers}` : '' }} 人</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.lobby__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}
.hello {
  margin: 0;
  font-size: 14px;
  color: var(--muted);
}
h1 {
  margin: 4px 0 0;
  font-size: 26px;
}
.lobby__logout {
  min-height: 40px;
  padding: 0 12px;
}
.join {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.join input {
  flex: 1;
  min-height: var(--touch-min);
  padding: 0 12px;
  border-radius: var(--radius);
  border: 1px solid #334155;
  background: var(--surface);
  color: var(--text);
  text-transform: uppercase;
}
.block {
  margin-top: 22px;
}
.block h2 {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--muted);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.room-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-height: var(--touch-min);
  padding: 12px 14px;
  border: none;
  border-radius: var(--radius);
  background: var(--surface);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.room-row span {
  color: var(--muted);
  font-size: 13px;
}
.muted {
  color: var(--muted);
  font-size: 14px;
}
</style>
