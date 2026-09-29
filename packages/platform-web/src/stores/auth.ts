import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as authApi from '../api/auth.js';

const TOKEN_KEY = 'game-life-token';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const username = ref<string | null>(null);
  const userId = ref<string | null>(null);
  const ready = ref(false);

  const isLoggedIn = computed(() => !!token.value);

  function setSession(t: string, user: { id: string; username: string }) {
    token.value = t;
    username.value = user.username;
    userId.value = user.id;
    localStorage.setItem(TOKEN_KEY, t);
  }

  function logout() {
    token.value = null;
    username.value = null;
    userId.value = null;
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
      userId.value = me.id;
    } catch {
      logout();
    } finally {
      ready.value = true;
    }
  }

  async function register(user: string, password: string) {
    const res = await authApi.register({ username: user, password });
    setSession(res.token, res.user);
  }

  async function login(user: string, password: string) {
    const res = await authApi.login({ username: user, password });
    setSession(res.token, res.user);
  }

  return {
    token,
    username,
    userId,
    ready,
    isLoggedIn,
    logout,
    bootstrap,
    register,
    login,
  };
});
