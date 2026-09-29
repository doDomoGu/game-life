import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import type { WebGamePlugin } from '@game-life/shared';
import { useAuthStore } from '../stores/auth.js';

const baseRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { guest: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/RegisterView.vue'),
    meta: { guest: true },
  },
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('../views/HistoryView.vue'),
    meta: { requiresAuth: true },
  },
];

export function createAppRouter(games: WebGamePlugin[]) {
  const gameRoutes: RouteRecordRaw[] = games.map((game) => ({
    path: game.routePath,
    name: game.routeName,
    component: game.loadPlay,
    meta: { requiresAuth: true },
  }));

  const router = createRouter({
    history: createWebHistory(),
    routes: [...baseRoutes, ...gameRoutes],
  });

  router.beforeEach(async (to) => {
    const auth = useAuthStore();
    if (!auth.ready) {
      await auth.bootstrap();
    }
    if (to.meta.requiresAuth && !auth.isLoggedIn) {
      return { name: 'login', query: { redirect: to.fullPath } };
    }
    if (to.meta.guest && auth.isLoggedIn) {
      return { name: 'home' };
    }
  });

  return router;
}
