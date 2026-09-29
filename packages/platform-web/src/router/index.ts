import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import type { WebGamePlugin } from '@game-life/shared';
import { getWebGameById } from '../games/registry.js';
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
    name: 'lobby',
    component: () => import('../views/LobbyView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/room/:code',
    name: 'room',
    component: () => import('../views/RoomView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/game/:gameId/history',
    name: 'game-history',
    component: () => import('../views/HistoryView.vue'),
    meta: { requiresAuth: true },
  },
];

export function createAppRouter(games: WebGamePlugin[]) {
  const gameRoutes: RouteRecordRaw[] = games.flatMap((game) => {
    const routes: RouteRecordRaw[] = [
      {
        path: game.introRoutePath,
        name: game.introRouteName,
        component: () => import('../views/GameIntroView.vue'),
        meta: { requiresAuth: true, gameId: game.id },
      },
    ];
    if (game.loadPlay && game.playRoutePath && game.playRouteName) {
      routes.push({
        path: game.playRoutePath,
        name: game.playRouteName,
        component: game.loadPlay,
        meta: { requiresAuth: true, gameId: game.id },
      });
    }
    if (game.extraRoutes) {
      for (const extra of game.extraRoutes) {
        routes.push({
          path: extra.path,
          name: extra.name,
          component: extra.load,
          meta: { requiresAuth: true, gameId: game.id },
        });
      }
    }
    return routes;
  });

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
      return { name: 'login', query: { ...to.query, redirect: to.fullPath } };
    }
    if (to.name === 'game-history') {
      const gameId = to.params.gameId;
      if (typeof gameId === 'string' && !getWebGameById(gameId)) {
        return { name: 'lobby' };
      }
    }
    if (to.meta.guest && auth.isLoggedIn) {
      return { name: 'lobby' };
    }
  });

  return router;
}
