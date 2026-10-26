/** 游戏实时通道共用的连接与在线状态。游戏规则消息不放在这里。 */

export const REALTIME_PING_INTERVAL_MS = 20_000;
export const REALTIME_STALE_MS = 45_000;

export interface PresenceSocket {
  readyState: number;
  send(data: string): void;
}

export interface PresenceMember {
  connected: boolean;
  sockets: Set<PresenceSocket>;
  lastSeenAt: number;
}

export function bindSocket(member: PresenceMember, socket: PresenceSocket): void {
  member.sockets.add(socket);
  member.connected = true;
  member.lastSeenAt = Date.now();
}

export function unbindSocket(member: PresenceMember, socket: PresenceSocket): void {
  member.sockets.delete(socket);
  if (member.sockets.size === 0) member.connected = false;
}

export function noteSeen(member: PresenceMember): void {
  member.lastSeenAt = Date.now();
  if (member.sockets.size > 0) member.connected = true;
}

/** 连接还在但长时间没有消息时标为断线。返回是否有人状态变化。 */
export function refreshStale(members: PresenceMember[], staleMs = REALTIME_STALE_MS): boolean {
  const now = Date.now();
  let changed = false;
  for (const member of members) {
    if (member.sockets.size === 0) {
      if (member.connected) {
        member.connected = false;
        changed = true;
      }
      continue;
    }
    const stale = now - member.lastSeenAt > staleMs;
    if (stale && member.connected) {
      member.connected = false;
      changed = true;
    }
  }
  return changed;
}

export function sendJson(socket: PresenceSocket, type: string, payload: unknown): void {
  if (socket.readyState === 1) socket.send(JSON.stringify({ type, payload }));
}
