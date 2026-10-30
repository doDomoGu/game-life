import { authenticateToken } from '../services/auth.service.js';
import { getRoom, markSeen } from '../rooms/store.js';
import {
  bindSocket,
  noteSeen,
  sendJson,
  unbindSocket,
  type PresenceMember,
  type PresenceSocket,
} from './presence.js';

export interface RealtimeSocket extends PresenceSocket {
  on(event: 'message', cb: (raw: unknown) => void): void;
  on(event: 'close', cb: () => void): void;
  close?: () => void;
}

export interface RealtimeMessage {
  type?: string;
  payload?: unknown;
}

export interface AcceptPlayerSocketOptions {
  socket: RealtimeSocket;
  token: string;
  code: string;
  gameId: string;
  findMember: (code: string, userId: string) => PresenceMember | undefined;
  onMessage: (userId: string, message: RealtimeMessage) => Promise<void> | void;
  onChange: (code: string) => void;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return '请求失败';
}

function closeSocket(socket: RealtimeSocket): void {
  socket.close?.();
}

/**
 * 登录、房间成员、心跳和断线标记。
 * 调用方负责本游戏的会话查找和消息含义。
 */
export async function acceptPlayerSocket(options: AcceptPlayerSocketOptions): Promise<void> {
  const code = options.code.toUpperCase();
  let userId = '';
  try {
    const user = await authenticateToken(options.token);
    userId = user.id;
  } catch (err) {
    sendJson(options.socket, 'error', { message: errorMessage(err) });
    closeSocket(options.socket);
    return;
  }

  const room = getRoom(code);
  if (!room || room.gameId !== options.gameId) {
    sendJson(options.socket, 'error', { message: '房间不存在' });
    closeSocket(options.socket);
    return;
  }
  if (!room.players.some((player) => player.userId === userId)) {
    sendJson(options.socket, 'error', { message: '你不在该房间' });
    closeSocket(options.socket);
    return;
  }

  const joined = options.findMember(code, userId);
  if (!joined) {
    sendJson(options.socket, 'error', { message: '对局尚未开始' });
    closeSocket(options.socket);
    return;
  }
  // 连接绑定到当前这一局；重开一局后旧连接不能再操作新会话。
  const roundId = room.roundId;

  bindSocket(joined, options.socket);
  markSeen(userId);
  options.onChange(code);

  options.socket.on('message', (raw) => {
    let message: RealtimeMessage;
    try {
      message = JSON.parse(String(raw)) as RealtimeMessage;
    } catch {
      sendJson(options.socket, 'error', { message: '无效消息' });
      return;
    }
    const wasConnected = joined.connected;
    noteSeen(joined);
    markSeen(userId);
    if (!wasConnected) options.onChange(code);
    if (message.type === 'ping') {
      sendJson(options.socket, 'pong', { t: Date.now() });
      return;
    }

    const current = getRoom(code);
    if (!current || current.roundId !== roundId) {
      sendJson(options.socket, 'error', { message: '对局已重新开始，请刷新页面' });
      return;
    }
    if (current.status !== 'playing') {
      sendJson(options.socket, 'error', { message: '本局已结束' });
      return;
    }

    try {
      void Promise.resolve(options.onMessage(userId, message)).catch((err: unknown) => {
        sendJson(options.socket, 'error', { message: errorMessage(err) });
      });
    } catch (err) {
      sendJson(options.socket, 'error', { message: errorMessage(err) });
    }
  });

  options.socket.on('close', () => {
    unbindSocket(joined, options.socket);
    options.onChange(code);
  });
}
