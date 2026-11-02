import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { UserPublic } from '@game-life/shared';
import * as authApi from '../api/auth.js';

const TOKEN_KEY = 'game-life-token';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const username = ref<string | null>(null);
  const nickname = ref<string | null>(null);
  const avatarUrl = ref<string | null>(null);
  const userId = ref<string | null>(null);
  const ready = ref(false);

  const isLoggedIn = computed(() => !!token.value);
  const displayName = computed(() => nickname.value || username.value || '');

  function applyUser(user: Pick<UserPublic, 'id' | 'username' | 'nickname' | 'avatarUrl'>) {
    userId.value = user.id;
    username.value = user.username;
    nickname.value = user.nickname || user.username;
    avatarUrl.value = user.avatarUrl || null;
  }

  function setSession(
    t: string,
    user: Pick<UserPublic, 'id' | 'username' | 'nickname' | 'avatarUrl'>,
  ) {
    token.value = t;
    applyUser(user);
    localStorage.setItem(TOKEN_KEY, t);
  }

  function logout() {
    token.value = null;
    username.value = null;
    nickname.value = null;
    avatarUrl.value = null;
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
      applyUser(me);
    } catch {
      logout();
    } finally {
      ready.value = true;
    }
  }

  async function refreshProfile() {
    const me = await authApi.fetchMe();
    applyUser(me);
    return me;
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
    nickname,
    avatarUrl,
    userId,
    ready,
    isLoggedIn,
    displayName,
    logout,
    bootstrap,
    refreshProfile,
    register,
    login,
    applyUser,
  };
});
