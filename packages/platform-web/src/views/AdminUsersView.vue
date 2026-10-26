<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchAdminUsers, type AdminUserRow } from '../api/admin.js';
import { useAdminStore } from '../stores/admin.js';

const admin = useAdminStore();
const router = useRouter();
const users = ref<AdminUserRow[]>([]);
const error = ref('');
const loading = ref(true);

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function logout() {
  admin.logout();
  void router.replace({ name: 'admin-login' });
}

onMounted(async () => {
  try {
    users.value = await fetchAdminUsers();
  } catch (e: unknown) {
    const status =
      e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { status?: number } }).response?.status
        : undefined;
    if (status === 401) {
      admin.logout();
      await router.replace({ name: 'admin-login' });
      return;
    }
    error.value = '用户列表加载失败';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="page">
    <header class="top">
      <div>
        <h1>用户管理</h1>
        <p class="sub">已注册 {{ users.length }} 人</p>
      </div>
      <button type="button" class="btn btn--ghost" @click="logout">退出</button>
    </header>

    <p v-if="loading" class="sub">加载中…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="users.length === 0" class="sub">还没有注册用户</p>
    <ul v-else class="users">
      <li v-for="user in users" :key="user.id">
        <span class="name">{{ user.username }}</span>
        <span class="time">{{ formatTime(user.createdAt) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
h1 {
  margin: 0;
  font-size: 28px;
}
.sub {
  color: var(--muted);
  margin: 6px 0 0;
}
.users {
  list-style: none;
  margin: 20px 0 0;
  padding: 0;
}
.users li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--surface);
}
.name {
  font-weight: 650;
}
.time {
  color: var(--muted);
  font-size: 13px;
}
</style>
