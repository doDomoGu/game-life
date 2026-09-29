import { createApp } from 'vue';
import { createPinia } from 'pinia';
import type { WebGamePlugin } from '@game-life/shared';
import App from './App.vue';
import { registerWebGames } from './games/registry.js';
import { createAppRouter } from './router/index.js';
import './styles/mobile.css';

export type { WebGamePlugin } from '@game-life/shared';

export { submitRecord, fetchMyRecords, fetchMyStats } from './api/records.js';
export { api } from './api/client.js';
export { useAuthStore } from './stores/auth.js';

export interface CreatePlatformAppOptions {
  games: WebGamePlugin[];
}

export function createPlatformApp(options: CreatePlatformAppOptions) {
  registerWebGames(options.games);
  const app = createApp(App);
  app.use(createPinia());
  app.use(createAppRouter(options.games));
  app.mount('#app');
}
