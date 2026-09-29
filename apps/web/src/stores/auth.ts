import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as authApi from '@/api/auth';

const TOKEN_KEY = 'game-life-token';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const username = ref<string | null>(null);
  const ready = ref(false);

  const isLoggedIn = computed(() => !!token.value);

  function setSession(t: string, name: string) {
    token.value = t;
    username.value = name;
    localStorage.setItem(TOKEN_KEY, t);
  }

  function logout() {
    token.value = null;
    username.value = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  async function bootstrap() {
    if (!token.value) {
      ready.value = true;
      return;
    }
    try {
      const me = await authApi.fetchMe();
      username.value = me.username;
    } catch {
      logout();
    } finally {
      ready.value = true;
    }
  }

  async function register(user: string, password: string) {
    const res = await authApi.register({ username: user, password });
    setSession(res.token, res.user.username);
  }

  async function login(user: string, password: string) {
    const res = await authApi.login({ username: user, password });
    setSession(res.token, res.user.username);
  }

  return {
    token,
    username,
    ready,
    isLoggedIn,
    logout,
    bootstrap,
    register,
    login,
  };
});
