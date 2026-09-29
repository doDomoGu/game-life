<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { fetchMyStats } from '../api/records.js';
import { getWebGameById } from '../games/registry.js';

const route = useRoute();
const router = useRouter();

const gameId = computed(() => {
  const fromMeta = route.meta.gameId;
  if (typeof fromMeta === 'string') return fromMeta;
  return '';
});

const game = computed(() => (gameId.value ? getWebGameById(gameId.value) : undefined));

const stats = ref<Awaited<ReturnType<typeof fetchMyStats>> | null>(null);
const loadingStats = ref(true);

async function loadStats() {
  if (!gameId.value) return;
  loadingStats.value = true;
  try {
    stats.value = await fetchMyStats(gameId.value);
  } catch {
    stats.value = null;
  } finally {
    loadingStats.value = false;
  }
}

onMounted(loadStats);
watch(gameId, loadStats);

function openHistory() {
  if (gameId.value) {
    router.push({ name: 'game-history', params: { gameId: gameId.value } });
  }
}
</script>

<template>
  <div v-if="game" class="page game-intro">
    <header class="game-intro__head">
      <RouterLink to="/" class="back">← 游戏大厅</RouterLink>
      <div class="game-intro__hero">
        <span class="game-intro__cover" aria-hidden="true">{{ game.cover ?? '🎮' }}</span>
        <div>
          <h1>{{ game.name }}</h1>
          <p class="game-intro__tagline">{{ game.description }}</p>
        </div>
      </div>
    </header>

    <section class="game-intro__section">
      <h2>玩法说明</h2>
      <ul class="rules">
        <li v-for="(line, index) in game.intro.rules" :key="index">{{ line }}</li>
      </ul>
    </section>

    <div v-if="stats && stats.totalGames > 0" class="stats">
      <div class="stat">
        <span class="stat__label">已完成局数</span>
        <span class="stat__value">{{ stats.totalGames }}</span>
      </div>
      <div class="stat">
        <span class="stat__label">{{ game.intro.bestRecordLabel }}</span>
        <span class="stat__value">{{
          game.intro.recordStyle === 'match' ? (stats.wins ?? 0) : (stats.bestFlipTurns ?? '—')
        }}</span>
      </div>
    </div>
    <p v-if="stats && stats.opponents.length" class="opponents">
      一起玩过：{{ stats.opponents.join('、') }}
    </p>
    <p v-else-if="!loadingStats" class="stats-empty">暂无对局记录</p>

    <p class="hint">由房主在房间中选择本游戏并开始。</p>
    <button type="button" class="btn start" @click="router.push({ name: 'lobby' })">返回房间列表</button>
    <button type="button" class="btn btn--ghost history-btn" @click="openHistory">对局历史</button>
  </div>
  <div v-else class="page">
    <p class="muted">游戏不存在</p>
    <RouterLink to="/">返回大厅</RouterLink>
  </div>
</template>

<style scoped>
.game-intro__head {
  margin-bottom: 20px;
}

.back {
  font-size: 14px;
  display: inline-block;
  margin-bottom: 16px;
}

.game-intro__hero {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.game-intro__cover {
  font-size: 48px;
  line-height: 1;
  flex-shrink: 0;
}

h1 {
  margin: 0;
  font-size: 24px;
}

.game-intro__tagline {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--muted);
  line-height: 1.4;
}

.game-intro__section h2 {
  margin: 0 0 10px;
  font-size: 16px;
  color: var(--muted);
  font-weight: 600;
}

.rules {
  margin: 0;
  padding-left: 20px;
  line-height: 1.6;
  font-size: 15px;
}

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 24px 0;
}

.stat {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat__label {
  font-size: 12px;
  color: var(--muted);
}

.stat__value {
  font-size: 22px;
  font-weight: 700;
  color: var(--accent);
}

.hint {
  color: var(--muted);
  font-size: 14px;
  margin: 8px 0 16px;
}

.stats-empty {
  color: var(--muted);
  font-size: 14px;
  margin: 20px 0 24px;
}

.opponents {
  margin: 0 0 20px;
  font-size: 14px;
  color: var(--muted);
  line-height: 1.5;
}

.start {
  width: 100%;
  font-size: 17px;
  margin-bottom: 10px;
}

.history-btn {
  width: 100%;
}

.muted {
  color: var(--muted);
}
</style>
