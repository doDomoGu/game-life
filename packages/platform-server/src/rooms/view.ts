import { getServerGame } from '../games/registry.js';
import type { PlatformRoom, VoteDecision } from './store.js';
import { isPlayerOnline } from './store.js';

export interface RoomPlayerView {
  userId: string;
  username: string;
  role: PlatformRoom['players'][number]['role'];
  ready: boolean;
  connected: boolean;
}

export interface RoomVoteView {
  kind: 'end' | 'rematch';
  initiatorId: string;
  createdAt: number;
  expiresAt: number;
  votes: Record<string, VoteDecision>;
}

export interface RoomView {
  code: string;
  status: PlatformRoom['status'];
  hostUserId: string;
  gameId: string | null;
  gameName: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  players: RoomPlayerView[];
  playerCount: number;
  roundId: number;
  vote: RoomVoteView | null;
  endReason: PlatformRoom['endReason'];
}

export function toView(room: PlatformRoom): RoomView {
  const game = room.gameId ? getServerGame(room.gameId) : undefined;
  return {
    code: room.code,
    status: room.status,
    hostUserId: room.hostUserId,
    gameId: room.gameId,
    gameName: game?.name ?? null,
    minPlayers: game?.minPlayers ?? null,
    maxPlayers: game?.maxPlayers ?? null,
    players: room.players.map((player) => ({
      userId: player.userId,
      username: player.username,
      role: player.role,
      ready: player.ready,
      connected: isPlayerOnline(player),
    })),
    playerCount: room.players.length,
    roundId: room.roundId,
    vote: room.vote
      ? {
          kind: room.vote.kind,
          initiatorId: room.vote.initiatorId,
          createdAt: room.vote.createdAt,
          expiresAt: room.vote.expiresAt,
          votes: { ...room.vote.votes },
        }
      : null,
    endReason: room.endReason,
  };
}
