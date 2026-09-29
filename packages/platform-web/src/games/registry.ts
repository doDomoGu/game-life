import { shallowRef } from 'vue';
import type { WebGamePlugin } from '@game-life/shared';

export const registeredWebGames = shallowRef<WebGamePlugin[]>([]);

export function registerWebGames(games: WebGamePlugin[]) {
  registeredWebGames.value = games;
}

export function listWebGames(): WebGamePlugin[] {
  return registeredWebGames.value;
}

export function getWebGameById(gameId: string): WebGamePlugin | undefined {
  return registeredWebGames.value.find((g) => g.id === gameId);
}

export function resolveWebGameByDirect(direct: string): WebGamePlugin | undefined {
  const key = direct.trim();
  if (!key) return undefined;
  return registeredWebGames.value.find(
    (g) =>
      g.id === key ||
      g.introRouteName === key ||
      g.playRouteName === key,
  );
}
