<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adminLogin } from '../api/admin.js';
import { useAdminStore } from '../stores/admin.js';

const admin = useAdminStore();
const router = useRouter();
const route = useRoute();

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function onSubmit() {
  error.value = '';
  loading.value = true;
  try {
    const result = await adminLogin(username.value.trim(), password.value);
    admin.setSession(result.token, result.username);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '';
    if (redirect.startsWith('/admin')) {
      await router.replace(redirect);
    } else {
      await router.replace({ name: 'admin-users' });
    }
  } catch (e: unknown) {
    const msg =
      e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
    error.value = msg ?? '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="page">
    <h1>后台登录</h1>
    <p class="sub">Game Life 管理</p>
    <form @submit.prevent="onSubmit">
      <div class="field">
        <label for="admin-username">用户名</label>
        <input id="admin-username" v-model="username" autocomplete="username" required />
      </div>
      <div class="field">
        <label for="admin-password">密码</label>
        <input
          id="admin-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <button class="btn" type="submit" :disabled="loading" style="width: 100%">
        {{ loading ? '登录中…' : '登录' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
h1 {
  margin: 0 0 4px;
  font-size: 28px;
}
.sub {
  color: var(--muted);
  margin: 0 0 24px;
}
</style>
