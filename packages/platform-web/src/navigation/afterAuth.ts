import type { Router, RouteLocationNormalizedLoaded } from 'vue-router';
export async function navigateAfterAuth(
  router: Router,
  route: RouteLocationNormalizedLoaded,
) {
  const redirect = route.query.redirect;
  if (typeof redirect === 'string' && redirect && !redirect.startsWith('/login')) {
    await router.replace(redirect);
    return;
  }

  await router.replace({ name: 'lobby' });
}
