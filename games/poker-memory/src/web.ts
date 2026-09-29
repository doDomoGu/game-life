import type { WebGamePlugin } from '@game-life/shared';
import { pokerMemoryMeta } from './meta.js';

export const pokerMemoryWebPlugin: WebGamePlugin = {
  id: pokerMemoryMeta.id,
  name: pokerMemoryMeta.name,
  description: pokerMemoryMeta.description,
  routeName: 'poker-memory',
  routePath: '/play/poker-memory',
  loadPlay: () => import('./web/Play.vue'),
};
