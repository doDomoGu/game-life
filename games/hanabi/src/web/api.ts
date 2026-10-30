import { api } from '@game-life/platform-web';
import type { HanabiView } from '../view.js';

export interface HanabiActionMessage {
  type: 'action:hint' | 'action:discard' | 'action:play';
  payload: Record<string, unknown>;
}

const base = '/games/hanabi/rooms';

export async function fetchHanabiRoom(code: string) {
  const { data } = await api.get<HanabiView>(`${base}/${encodeURIComponent(code)}`);
  return data;
}

export async function sendHanabiAction(code: string, message: HanabiActionMessage) {
  const { data } = await api.post<HanabiView>(
    `${base}/${encodeURIComponent(code)}/action`,
    message,
  );
  return data;
}
