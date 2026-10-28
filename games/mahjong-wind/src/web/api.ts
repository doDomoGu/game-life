import { api, createGameSocket, type ConnectionState, type GameSocket } from '@game-life/platform-web';
import { mahjongWindMeta } from '../meta.js';
import type { MahjongWindView } from '../view.js';

export type { ConnectionState };

export interface WindActionMessage {
  type:
    | 'action:riichi'
    | 'action:cancel-riichi'
    | 'action:settle-start'
    | 'action:settle-cancel'
    | 'action:settle-submit'
    | 'action:next-hand'
    | 'action:end-match'
    | 'action:undo-hand'
    | 'action:back-hand';
  payload?: Record<string, unknown>;
}

const base = `/games/${mahjongWindMeta.id}/rooms`;

export async function fetchWindRoom(code: string) {
  const { data } = await api.get<MahjongWindView>(`${base}/${encodeURIComponent(code)}`);
  return data;
}

export async function sendWindAction(code: string, message: WindActionMessage) {
  const { data } = await api.post<MahjongWindView>(`${base}/${encodeURIComponent(code)}/action`, message);
  return data;
}

export function createWindSocket(options: {
  code: string;
  token: string;
  onUpdate: (view: MahjongWindView) => void;
  onError: (message: string) => void;
  onStatus: (state: ConnectionState) => void;
}): GameSocket {
  return createGameSocket({
    path: `/api${base}/${encodeURIComponent(options.code)}/ws`,
    token: options.token,
    onStatus: options.onStatus,
    onMessage(message) {
      if (message.type === 'room:update') {
        options.onUpdate(message.payload as MahjongWindView);
        return;
      }
      if (message.type === 'error') {
        const payload = message.payload as { message?: string } | undefined;
        options.onError(payload?.message ?? '操作失败');
      }
    },
  });
}
