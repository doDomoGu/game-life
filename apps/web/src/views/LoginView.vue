<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
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
    await auth.login(username.value.trim(), password.value);
    const redirect = (route.query.redirect as string) || '/';
    await router.replace(redirect);
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
    <h1>登录</h1>
    <p class="sub">扑克记忆翻牌 · Game Life</p>
    <form @submit.prevent="onSubmit">
      <div class="field">
        <label for="username">用户名</label>
        <input id="username" v-model="username" autocomplete="username" required />
      </div>
      <div class="field">
        <label for="password">密码</label>
        <input
          id="password"
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
    <p class="foot">
      没有账号？
      <RouterLink to="/register">注册</RouterLink>
    </p>
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
.foot {
  margin-top: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 14px;
}
</style>
