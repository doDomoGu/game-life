import type { Router, RouteLocationNormalizedLoaded } from 'vue-router';
import { resolveWebGameByDirect } from '../games/registry.js';
export async function navigateAfterAuth(
  router: Router,
  route: RouteLocationNormalizedLoaded,
) {
  const direct = route.query.direct;
  if (typeof direct === 'string' && direct) {
    const game = resolveWebGameByDirect(direct);
    if (game) {
      await router.replace({ name: game.introRouteName });
      return;
    }
  }

  const redirect = route.query.redirect;
  if (typeof redirect === 'string' && redirect && !redirect.startsWith('/login')) {
    await router.replace(redirect);
    return;
  }

  await router.replace({ name: 'lobby' });
}
