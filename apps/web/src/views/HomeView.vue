<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { POKER_MEMORY } from '@game-life/shared';
import { fetchMyStats } from '@/api/records';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const stats = ref<Awaited<ReturnType<typeof fetchMyStats>> | null>(null);

onMounted(async () => {
  try {
    stats.value = await fetchMyStats();
  } catch {
    stats.value = null;
  }
});

function start() {
  router.push({ name: 'poker-memory' });
}

function logout() {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="page home">
    <header class="home__top">
      <div>
        <p class="hello">你好，{{ auth.username }}</p>
        <h1>{{ POKER_MEMORY.name }}</h1>
      </div>
      <button type="button" class="btn btn--ghost home__logout" @click="logout">退出</button>
    </header>

    <p class="desc">{{ POKER_MEMORY.description }}</p>

    <div v-if="stats" class="stats">
      <div class="stat">
        <span class="stat__label">已完成局数</span>
        <span class="stat__value">{{ stats.totalGames }}</span>
      </div>
      <div class="stat">
        <span class="stat__label">最少翻开次数</span>
        <span class="stat__value">{{ stats.bestFlipTurns ?? '—' }}</span>
      </div>
    </div>

    <button type="button" class="btn start" @click="start">开始游戏</button>
    <RouterLink class="link-history" to="/history">查看对局历史</RouterLink>
  </div>
</template>

<style scoped>
.home__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.hello {
  margin: 0;
  font-size: 14px;
  color: var(--muted);
}

h1 {
  margin: 4px 0 0;
  font-size: 24px;
}

.home__logout {
  min-height: 40px;
  padding: 0 12px;
  flex-shrink: 0;
}

.desc {
  color: var(--muted);
  line-height: 1.5;
  margin: 0 0 20px;
}

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 24px;
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

.start {
  width: 100%;
  font-size: 17px;
}

.link-history {
  display: block;
  text-align: center;
  margin-top: 16px;
  font-size: 15px;
}
</style>
