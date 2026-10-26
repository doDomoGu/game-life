import { REALTIME_PING_INTERVAL_MS } from './timing.js';

export type ConnectionState = 'connecting' | 'open' | 'closed';

export interface GameSocketMessage {
  type: string;
  payload?: unknown;
}

export interface GameSocket {
  send(message: GameSocketMessage): boolean;
  isOpen(): boolean;
  close(): void;
}

export interface GameSocketOptions {
  /** 以 /api 开头的路径，不含域名 */
  path: string;
  token: string;
  pingIntervalMs?: number;
  reconnectDelayMs?: number;
  onMessage: (message: { type?: string; payload?: unknown }) => void;
  onStatus: (state: ConnectionState) => void;
}

function socketUrl(path: string, token: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const join = suffix.includes('?') ? '&' : '?';
  return `${proto}://${location.host}${base}${suffix}${join}token=${encodeURIComponent(token)}`;
}

/** 游戏实时通道的连接壳：地址、心跳、断线重连、连接状态。消息内容由各游戏解释。 */
export function createGameSocket(options: GameSocketOptions): GameSocket {
  const pingIntervalMs = options.pingIntervalMs ?? REALTIME_PING_INTERVAL_MS;
  const reconnectDelayMs = options.reconnectDelayMs ?? 1500;
  const url = socketUrl(options.path, options.token);

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

  function connect() {
    options.onStatus('connecting');
    ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      options.onStatus('open');
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, pingIntervalMs);
    });

    ws.addEventListener('message', (event) => {
      let message: { type?: string; payload?: unknown };
      try {
        message = JSON.parse(String(event.data)) as { type?: string; payload?: unknown };
      } catch {
        return;
      }
      if (message.type === 'pong') return;
      options.onMessage(message);
    });

    ws.addEventListener('close', () => {
      clearTimers();
      options.onStatus('closed');
      if (!closedByUser) {
        reconnectTimer = setTimeout(connect, reconnectDelayMs);
      }
    });
  }

  connect();

  return {
    send(message) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        return true;
      }
      return false;
    },
    isOpen: () => ws?.readyState === WebSocket.OPEN,
    close() {
      closedByUser = true;
      clearTimers();
      ws?.close();
      ws = null;
    },
  };
}
