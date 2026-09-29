<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { GameRecord } from '@game-life/shared';
import { fetchMyRecords } from '@/api/records';

const items = ref<GameRecord[]>([]);
const loading = ref(true);
const error = ref('');

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

onMounted(async () => {
  try {
    const data = await fetchMyRecords({ page: 1 });
    items.value = data.items;
  } catch {
    error.value = '加载失败';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="page">
    <header class="head">
      <RouterLink to="/" class="back">← 首页</RouterLink>
      <h1>对局历史</h1>
    </header>
    <p class="sub">每局记录的翻开次数（越少越好）</p>

    <p v-if="loading" class="muted">加载中…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="items.length === 0" class="muted">还没有记录，先去玩一局吧。</p>

    <ul v-else class="list">
      <li v-for="row in items" :key="row.id" class="row">
        <div>
          <span class="score">{{ row.rawScore }} 次</span>
          <span class="time">{{ formatTime(row.playedAt) }}</span>
        </div>
        <span class="dur">用时 {{ formatDuration(row.durationMs) }}</span>
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

.score {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
  margin-right: 10px;
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
