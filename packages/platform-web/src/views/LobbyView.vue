<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { LeaderboardEntry, LeaderboardResponse, SudokuDifficulty } from '@game-life/shared';
import { gameCapacityLabel } from '@game-life/shared';
import { createRoom, fetchRooms, joinRoom, type RoomView } from '../api/rooms.js';
import { fetchLeaderboard } from '../api/scores.js';
import { getWebGameById, listWebGames } from '../games/registry.js';
import { useAuthStore } from '../stores/auth.js';
import { useRoomStore } from '../stores/room.js';
import AccountDrawer from '../components/AccountDrawer.vue';

const auth = useAuthStore();
const roomStore = useRoomStore();
const route = useRoute();
const router = useRouter();

const notice = computed(() =>
  typeof route.query.notice === 'string' ? route.query.notice : '',
);

const mine = ref<RoomView | null>(null);
const waiting = ref<RoomView[]>([]);
const joinCode = ref('');
const error = ref('');
const loading = ref(false);
const accountOpen = ref(false);
const avatarInitial = computed(() => Array.from(auth.displayName)[0] ?? '?');

const games = listWebGames();
const scoreGameId = ref(games.find((game) => game.id === 'sudoku')?.id ?? games[0]?.id ?? '');
const scoreDifficulty = ref<SudokuDifficulty>('easy');
const difficultyOptions: Array<{ id: SudokuDifficulty; label: string }> = [
  { id: 'easy', label: '简单' },
  { id: 'normal', label: '普通' },
  { id: 'hard', label: '困难' },
];
const leaderboard = ref<LeaderboardResponse | null>(null);
const scoreLoading = ref(false);
const scoreError = ref('');
const scoreGame = computed(() => (scoreGameId.value ? getWebGameById(scoreGameId.value) : undefined));
const topEntries = computed(() => leaderboard.value?.entries.slice(0, 10) ?? []);
const myEntry = computed(() => leaderboard.value?.me ?? null);
const myEntryInTop = computed(
  () => !!myEntry.value && topEntries.value.some((entry) => entry.userId === myEntry.value?.userId),
);

async function load() {
  const data = await fetchRooms();
  mine.value = data.mine;
  roomStore.mine = data.mine;
  waiting.value = data.waiting.filter((room) => room.code !== data.mine?.code);
}

function formatMs(ms: number | null | undefined) {
  if (ms == null) return '—';
  const sec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(sec / 60);
  return `${min}:${String(sec % 60).padStart(2, '0')}`;
}

function scoreText(entry: LeaderboardEntry) {
  const style = leaderboard.value?.style;
  if (style === 'sudoku') {
    return `完成 ${entry.sudokuCompleted ?? 0}/30 · 总最佳 ${formatMs(entry.sudokuTotalBestMs)}`;
  }
  if (style === 'wins') return `${entry.wins} 胜 · ${entry.games} 局`;
  if (style === 'time') return `最佳 ${formatMs(entry.bestTimeMs)} · ${entry.games} 局`;
  if (style === 'best') return `最佳 ${entry.bestScore ?? '—'} · ${entry.games} 局`;
  return `最高 ${entry.bestScore ?? 0} 分 · ${entry.games} 局`;
}

async function loadLeaderboard() {
  if (!scoreGameId.value) return;
  scoreLoading.value = true;
  scoreError.value = '';
  try {
    leaderboard.value = await fetchLeaderboard(
      scoreGameId.value,
      scoreGameId.value === 'sudoku' ? scoreDifficulty.value : undefined,
    );
  } catch {
    scoreError.value = '积分榜加载失败';
    leaderboard.value = null;
  } finally {
    scoreLoading.value = false;
  }
}

watch([scoreGameId, scoreDifficulty], () => {
  void loadLeaderboard();
});

onMounted(() => {
  load().catch(() => {
    error.value = '房间列表加载失败';
  });
  void loadLeaderboard();
});

function openRoom(code: string) {
  router.push({ name: 'room', params: { code } });
}

function closeAccount() {
  accountOpen.value = false;
  if (auth.isLoggedIn) void loadLeaderboard();
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

function statusLabel(room: RoomView) {
  if (!room.gameName) return '未选游戏';
  return room.gameName;
}

function crowdLabel(room: RoomView) {
  if (room.minPlayers != null && room.maxPlayers != null && room.minPlayers === room.maxPlayers) {
    return gameCapacityLabel(room.minPlayers, room.maxPlayers);
  }
  return `${room.playerCount}${room.maxPlayers ? `/${room.maxPlayers}` : ''} 人`;
}
</script>

<template>
  <div class="page lobby">
    <header class="lobby__top">
      <div>
        <p class="hello">你好，{{ auth.displayName }}</p>
        <h1>房间</h1>
      </div>
      <button type="button" class="account" aria-label="账号中心" @click="accountOpen = true">
        <span class="account__avatar">
          <img v-if="auth.avatarUrl" :src="auth.avatarUrl" alt="" />
          <span v-else>{{ avatarInitial }}</span>
        </span>
        <span class="account__name">{{ auth.displayName }}</span>
      </button>
    </header>

    <button type="button" class="btn" style="width: 100%; margin-bottom: 16px" :disabled="loading" @click="onCreate">
      创建房间
    </button>

    <div class="join">
      <input v-model="joinCode" placeholder="输入房间号加入" autocapitalize="characters" />
      <button type="button" class="btn btn--ghost" :disabled="loading" @click="onJoin()">加入</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="notice" class="error">{{ notice }}</p>

    <section v-if="mine" class="block">
      <h2>我的房间</h2>
      <button type="button" class="room-row" @click="openRoom(mine.code)">
        <strong>{{ mine.code }}</strong>
        <span>{{ statusLabel(mine) }} · {{ crowdLabel(mine) }}</span>
      </button>
    </section>

    <section class="block">
      <h2>等待中的房间</h2>
      <p v-if="waiting.length === 0" class="muted">还没有等待中的房间</p>
      <ul v-else class="list">
        <li v-for="room in waiting" :key="room.code">
          <button type="button" class="room-row" @click="onJoin(room.code)">
            <strong>{{ room.code }}</strong>
            <span>{{ statusLabel(room) }} · {{ crowdLabel(room) }}</span>
          </button>
        </li>
      </ul>
    </section>
    <section class="block scores">
      <div class="scores__head">
        <div>
          <h2>积分榜</h2>
          <p class="muted scores__sub">{{ scoreGame?.name ?? '选择一个游戏' }}</p>
        </div>
        <select v-model="scoreGameId" class="scores__select" aria-label="选择积分榜游戏">
          <option v-for="game in games" :key="game.id" :value="game.id">{{ game.name }}</option>
        </select>
      </div>

      <div v-if="scoreGameId === 'sudoku'" class="score-diffs">
        <button
          v-for="item in difficultyOptions"
          :key="item.id"
          type="button"
          class="score-diff"
          :class="{ 'score-diff--active': scoreDifficulty === item.id }"
          @click="scoreDifficulty = item.id"
        >
          {{ item.label }}
        </button>
      </div>

      <p v-if="scoreError" class="error">{{ scoreError }}</p>
      <p v-else-if="scoreLoading" class="muted">积分榜加载中…</p>
      <ol v-else-if="topEntries.length" class="score-list">
        <li
          v-for="entry in topEntries"
          :key="entry.userId"
          :class="{ 'score-row--me': entry.userId === auth.userId }"
        >
          <span class="score-rank">{{ entry.rank }}</span>
          <span class="score-name">{{ entry.username }}</span>
          <span class="score-value">{{ scoreText(entry) }}</span>
        </li>
      </ol>
      <p v-else class="muted">还没有人上榜</p>

      <div v-if="myEntry && !myEntryInTop" class="my-score">
        <span class="score-rank">{{ myEntry.rank }}</span>
        <span class="score-name">{{ myEntry.username }}（我）</span>
        <span class="score-value">{{ scoreText(myEntry) }}</span>
      </div>
      <p v-else-if="!myEntry && !scoreLoading && topEntries.length > 0" class="muted">
        你还没有这个游戏的成绩
      </p>
    </section>

    <AccountDrawer :open="accountOpen" @close="closeAccount" />
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
.account {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  max-width: 170px;
  padding: 4px 10px 4px 4px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.account__avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(56, 189, 248, 0.18);
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  flex: none;
}
.account__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.account__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
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
.scores__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.scores__head h2 {
  margin-bottom: 2px;
}
.scores__sub {
  margin: 0;
  font-size: 12px;
}
.scores__select {
  max-width: 150px;
  min-height: 36px;
  padding: 0 8px;
  border-radius: 9px;
  border: 1px solid #334155;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}
.score-diffs {
  display: flex;
  gap: 6px;
  margin: 10px 0 8px;
}
.score-diff {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #334155;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.score-diff--active {
  border-color: var(--accent);
  background: rgba(56, 189, 248, 0.14);
  color: var(--accent);
}
.score-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.score-list li,
.my-score {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 9px;
  background: var(--surface);
  font-size: 13px;
}
.score-row--me {
  outline: 1px solid var(--accent);
  outline-offset: -1px;
}
.score-rank {
  color: var(--muted);
  font-weight: 700;
  text-align: center;
}
.score-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.score-value {
  color: var(--muted);
  font-size: 11px;
  text-align: right;
}
.my-score {
  margin-top: 6px;
  border: 1px dashed rgba(56, 189, 248, 0.45);
  background: rgba(56, 189, 248, 0.07);
}
.muted {
  color: var(--muted);
  font-size: 14px;
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
