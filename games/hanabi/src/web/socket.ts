import { createGameSocket, type ConnectionState, type GameSocket } from '@game-life/platform-web';
import type { HanabiView } from '../view.js';

export type { ConnectionState };

export type HanabiSocket = GameSocket;

interface Options {
  code: string;
  token: string;
  onUpdate: (view: HanabiView) => void;
  onError: (message: string) => void;
  onStatus: (state: ConnectionState) => void;
}

export function createHanabiSocket(options: Options): HanabiSocket {
  return createGameSocket({
    path: `/api/games/hanabi/rooms/${encodeURIComponent(options.code)}/ws`,
    token: options.token,
    onStatus: options.onStatus,
    onMessage(message) {
      if (message.type === 'room:update') {
        options.onUpdate(message.payload as HanabiView);
        return;
      }
      if (message.type === 'error') {
        const payload = message.payload as { message?: string } | undefined;
        options.onError(payload?.message ?? '操作失败');
      }
    },
  });
}
