import type { HanabiView } from '../view.js';
import type { HanabiActionMessage } from './api.js';

export type ConnectionState = 'connecting' | 'open' | 'closed';

export interface HanabiSocket {
  send(message: HanabiActionMessage): boolean;
  isOpen(): boolean;
  close(): void;
}

interface Options {
  code: string;
  token: string;
  onUpdate: (view: HanabiView) => void;
  onError: (message: string) => void;
  onStatus: (state: ConnectionState) => void;
}

export function createHanabiSocket(options: Options): HanabiSocket {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const url =
    `${proto}://${location.host}${base}/api/games/hanabi/rooms/` +
    `${encodeURIComponent(options.code)}/ws?token=${encodeURIComponent(options.token)}`;

  let ws: WebSocket | null = null;
  let closedByUser = false;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function clearTimers() {
    if (pingTimer) clearInterval(pingTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    pingTimer = null;
    reconnectTimer = null;
  }

  function rawSend(message: HanabiActionMessage) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  function connect() {
    options.onStatus('connecting');
    ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      options.onStatus('open');
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, 20000);
    });

    ws.addEventListener('message', (event) => {
      let message: { type?: string; payload?: unknown };
      try {
        message = JSON.parse(String(event.data)) as { type?: string; payload?: unknown };
      } catch {
        return;
      }
      if (message.type === 'room:update') {
        options.onUpdate(message.payload as HanabiView);
      } else if (message.type === 'error') {
        const payload = message.payload as { message?: string } | undefined;
        options.onError(payload?.message ?? '操作失败');
      }
    });

    ws.addEventListener('close', () => {
      clearTimers();
      options.onStatus('closed');
      if (!closedByUser) {
        reconnectTimer = setTimeout(connect, 1500);
      }
    });
  }

  connect();

  return {
    send: rawSend,
    isOpen: () => ws?.readyState === WebSocket.OPEN,
    close() {
      closedByUser = true;
      clearTimers();
      ws?.close();
      ws = null;
    },
  };
}
