import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { GameHttpApp } from '@game-life/shared';
import { acceptPlayerSocket, type RealtimeSocket } from '@game-life/platform-server';
import { drawGuessMeta } from '../meta.js';
import { applyMessage, broadcastSession, findMember } from './session.js';

export async function registerDrawGuessRoutes(app: GameHttpApp): Promise<void> {
  const fastify = app as unknown as FastifyInstance;

  fastify.get<{ Params: { code: string }; Querystring: { token?: string } }>(
    '/api/games/draw-guess/rooms/:code/ws',
    { websocket: true },
    (socket, request) => {
      void openSocket(socket as unknown as RealtimeSocket, request);
    },
  );
}

async function openSocket(socket: RealtimeSocket, request: FastifyRequest): Promise<void> {
  const query = request.query as { token?: string };
  const code = String((request.params as { code?: string }).code ?? '').toUpperCase();

  await acceptPlayerSocket({
    socket,
    token: String(query.token ?? ''),
    code,
    gameId: drawGuessMeta.id,
    findMember: (roomCode, userId) => findMember(roomCode, userId),
    onChange: (roomCode) => broadcastSession(roomCode),
    onMessage: (userId, message) => applyMessage(code, userId, message),
  });
}
