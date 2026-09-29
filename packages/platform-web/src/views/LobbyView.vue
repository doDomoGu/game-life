<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { MyStats } from '@game-life/shared';
import { fetchMyStats } from '../api/records.js';
import { listWebGames } from '../games/registry.js';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const router = useRouter();

const games = listWebGames();
const statsByGameId = ref<Record<string, MyStats>>({});
const loadingStats = ref(true);

onMounted(async () => {
  const entries = await Promise.all(
    games.map(async (game) => {
      try {
        const stats = await fetchMyStats(game.id);
        return [game.id, stats] as const;
      } catch {
        return [game.id, null] as const;
      }
    }),
  );
  for (const [id, stats] of entries) {
    if (stats) statsByGameId.value[id] = stats;
  }
  loadingStats.value = false;
});

function openIntro(introRouteName: string) {
  router.push({ name: introRouteName });
}

function logout() {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="page lobby">
    <header class="lobby__top">
      <div>
        <p class="hello">你好，{{ auth.username }}</p>
        <h1>游戏大厅</h1>
      </div>
      <button type="button" class="btn btn--ghost lobby__logout" @click="logout">退出</button>
    </header>

    <p class="sub">选择一款游戏开始</p>

    <ul class="game-list">
      <li v-for="game in games" :key="game.id" class="game-card">
        <button type="button" class="game-card__main" @click="openIntro(game.introRouteName)">
          <span class="game-card__cover" aria-hidden="true">{{ game.cover ?? '🎮' }}</span>
          <span class="game-card__body">
            <span class="game-card__title">{{ game.name }}</span>
            <span class="game-card__desc">{{ game.description }}</span>
          </span>
          <span class="game-card__go">进入</span>
        </button>
        <div v-if="statsByGameId[game.id]" class="game-card__stats">
          <span>已完成 {{ statsByGameId[game.id].totalGames }} 局</span>
          <span v-if="statsByGameId[game.id].bestFlipTurns != null">
            · 最少 {{ statsByGameId[game.id].bestFlipTurns }} 次翻开
          </span>
        </div>
        <p v-else-if="!loadingStats" class="game-card__stats game-card__stats--muted">暂无记录</p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.lobby__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 4px;
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
  flex-shrink: 0;
}

.sub {
  color: var(--muted);
  margin: 0 0 20px;
  font-size: 14px;
}

.game-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.game-card {
  background: var(--surface);
  border-radius: var(--radius);
  overflow: hidden;
}

.game-card__main {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  min-height: var(--touch-min);
}

.game-card__cover {
  font-size: 36px;
  line-height: 1;
  flex-shrink: 0;
  width: 48px;
  text-align: center;
}

.game-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.game-card__title {
  font-size: 17px;
  font-weight: 700;
}

.game-card__desc {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.4;
}

.game-card__go {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
}

.game-card__stats {
  padding: 0 16px 14px;
  font-size: 12px;
  color: var(--muted);
}

.game-card__stats--muted {
  padding-top: 0;
}

@media (min-width: 768px) {
  .game-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
}
</style>
