import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RealtimeSocket } from '../realtime/accept.js';
import { authenticateToken } from '../services/auth.service.js';
import {
  attachRoomSocket,
  detachRoomSocket,
  getRoom,
  subscribeRoomUpdates,
  type RoomSocket,
} from './store.js';
import { toView } from './view.js';

function close(socket: RoomSocket): void {
  try {
    socket.close?.();
  } catch {
    // 忽略关闭异常
  }
}

type RoomConnection = RoomSocket & RealtimeSocket;

function send(socket: RoomSocket, type: string, payload: unknown): void {
  try {
    if (socket.readyState === 1) socket.send(JSON.stringify({ type, payload }));
  } catch {
    // 连接可能刚好断开
  }
}

function reject(socket: RoomSocket, message: string): void {
  send(socket, 'room:closed', { message });
  close(socket);
}

async function openRoomSocket(socket: RoomConnection, request: FastifyRequest): Promise<void> {
  const query = request.query as { token?: string };
  const code = String((request.params as { code?: string }).code ?? '').toUpperCase();
  let userId = '';
  try {
    const user = await authenticateToken(String(query.token ?? ''));
    userId = user.id;
  } catch {
    reject(socket, '登录已失效，请重新登录');
    return;
  }

  const room = getRoom(code);
  if (!room) {
    reject(socket, '房间不存在');
    return;
  }
  if (!room.players.some((player) => player.userId === userId)) {
    reject(socket, '你不在该房间');
    return;
  }
  if (!attachRoomSocket(code, userId, socket)) {
    reject(socket, '房间状态已变化');
    return;
  }

  send(socket, 'room:update', toView(room));

  socket.on('message', (raw: unknown) => {
    let message: { type?: string };
    try {
      message = JSON.parse(String(raw)) as { type?: string };
    } catch {
      return;
    }
    if (message.type === 'ping') {
      const current = getRoom(code);
      if (!current) {
        reject(socket, '房间已关闭');
        return;
      }
      send(socket, 'pong', { t: Date.now() });
      return;
    }
    if (message.type === 'sync') {
      const current = getRoom(code);
      if (current) send(socket, 'room:update', toView(current));
    }
  });

  socket.on('close', () => {
    detachRoomSocket(code, userId, socket);
  });
}

/** 房间状态实时推送；每次房间变化由 store 广播给该房间的所有连接 */
export async function roomSocketRoutes(app: FastifyInstance) {
  app.get<{ Params: { code: string }; Querystring: { token?: string } }>(
    '/api/rooms/:code/ws',
    { websocket: true },
    (socket, request) => {
      void openRoomSocket(socket as unknown as RoomConnection, request);
    },
  );
}

subscribeRoomUpdates((room) => {
  const payload = toView(room);
  for (const player of room.players) {
    for (const socket of player.sockets) {
      send(socket, 'room:update', payload);
    }
  }
});
