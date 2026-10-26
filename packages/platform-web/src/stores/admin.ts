import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

const TOKEN_KEY = 'game-life-admin-token';

export const useAdminStore = defineStore('admin', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const username = ref<string | null>(token.value ? 'dodomogu' : null);
  const isLoggedIn = computed(() => !!token.value);

  function setSession(nextToken: string, nextUsername: string) {
    token.value = nextToken;
    username.value = nextUsername;
    localStorage.setItem(TOKEN_KEY, nextToken);
  }

  function logout() {
    token.value = null;
    username.value = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  return { token, username, isLoggedIn, setSession, logout };
});
