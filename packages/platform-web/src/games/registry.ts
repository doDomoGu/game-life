import { shallowRef } from 'vue';
import type { WebGamePlugin } from '@game-life/shared';

export const registeredWebGames = shallowRef<WebGamePlugin[]>([]);

export function registerWebGames(games: WebGamePlugin[]) {
  registeredWebGames.value = games;
}

export function getPrimaryWebGame(): WebGamePlugin | undefined {
  return registeredWebGames.value[0];
}
