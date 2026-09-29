<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { GameRecord } from '@game-life/shared';
import { fetchMyRecords, fetchMyStats } from '../api/records.js';
import { getWebGameById } from '../games/registry.js';

const route = useRoute();
const gameId = computed(() => String(route.params.gameId ?? ''));
const game = computed(() => getWebGameById(gameId.value));

const items = ref<GameRecord[]>([]);
const stats = ref<Awaited<ReturnType<typeof fetchMyStats>> | null>(null);
const loading = ref(true);
const error = ref('');

function opponentsOf(row: GameRecord) {
  const list = row.meta?.opponents;
  if (!Array.isArray(list)) return [];
  return list
    .map((item) =>
      item && typeof item === 'object' && 'username' in item && typeof item.username === 'string'
        ? item.username
        : '',
    )
    .filter(Boolean);
}

function isMatchRecord(row: GameRecord) {
  return typeof row.meta?.won === 'boolean';
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms?: number) {
  if (ms == null) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} 分 ${s} 秒`;
}

async function loadRecords() {
  if (!gameId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const [data, summary] = await Promise.all([
      fetchMyRecords({ gameId: gameId.value, page: 1 }),
      fetchMyStats(gameId.value),
    ]);
    items.value = data.items;
    stats.value = summary;
  } catch {
    error.value = '加载失败';
    items.value = [];
    stats.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadRecords);
watch(gameId, loadRecords);
</script>

<template>
  <div class="page">
    <header class="head">
      <RouterLink
        v-if="game"
        :to="game.introRoutePath"
        class="back"
      >
        ← {{ game.name }}
      </RouterLink>
      <RouterLink v-else to="/" class="back">← 游戏大厅</RouterLink>
      <h1>对局历史</h1>
    </header>
    <p v-if="game" class="sub">
      {{ game.name }} · {{ game.intro.historyScoreHint ?? game.intro.bestRecordLabel }}
    </p>

    <p v-if="loading" class="muted">加载中…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="items.length === 0" class="muted">还没有记录，先去玩一局吧。</p>

    <div v-if="game?.intro.recordStyle === 'match' && stats && stats.totalGames > 0" class="summary">
      <span>共 {{ stats.totalGames }} 局</span>
      <span>胜 {{ stats.wins ?? 0 }} 局</span>
      <span v-if="stats.opponents.length">对手：{{ stats.opponents.join('、') }}</span>
    </div>

    <ul v-if="items.length" class="list">
      <li v-for="row in items" :key="row.id" class="row">
        <div>
          <span v-if="isMatchRecord(row)" class="score" :class="{ 'score--loss': row.meta?.won !== true }">
            {{ row.meta?.won === true ? '胜' : '负' }}
          </span>
          <span v-else class="score">{{ row.rawScore }} 次</span>
          <span class="time">{{ formatTime(row.playedAt) }}</span>
          <p v-if="opponentsOf(row).length" class="with">和 {{ opponentsOf(row).join('、') }}</p>
          <p v-else-if="isMatchRecord(row)" class="with">单人</p>
        </div>
        <span v-if="row.durationMs != null" class="dur">用时 {{ formatDuration(row.durationMs) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.head {
  margin-bottom: 4px;
}

.back {
  font-size: 14px;
  display: inline-block;
  margin-bottom: 8px;
}

h1 {
  margin: 0;
  font-size: 24px;
}

.sub {
  color: var(--muted);
  font-size: 14px;
  margin: 0 0 16px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--muted);
}

.score {
  font-size: 18px;
  font-weight: 700;
  color: #4ade80;
  margin-right: 10px;
}

.score--loss {
  color: var(--muted);
}

.with {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.time {
  font-size: 13px;
  color: var(--muted);
}

.dur {
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
}

.muted {
  color: var(--muted);
}
</style>
