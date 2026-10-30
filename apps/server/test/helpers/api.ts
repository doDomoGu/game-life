import assert from 'node:assert/strict';

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
}

export interface Account {
  token: string;
  userId: string;
  username: string;
}

export interface GameMeta {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
}

export interface RoomPlayerView {
  userId: string;
  username: string;
  role: 'host' | 'guest';
  ready: boolean;
  connected: boolean;
}

export interface RoomView {
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  hostUserId: string;
  gameId: string | null;
  gameName: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  players: RoomPlayerView[];
  playerCount: number;
  roundId: number;
  vote: null | {
    kind: 'end' | 'rematch';
    initiatorId: string;
    expiresAt: number;
    votes: Record<string, 'yes' | 'no'>;
  };
  endReason: 'finished' | 'aborted' | null;
}

export interface RecordPage {
  items: Array<{ gameId: string; userId: string; rawScore: number; playedAt: string }>;
  total: number;
}

let sequence = 0;

export function uniqueName(prefix: string): string {
  sequence += 1;
  const stamp = Date.now().toString(36).slice(-5);
  return `${prefix}_${stamp}_${sequence}`.slice(0, 20);
}

export async function api<T = unknown>(
  base: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<ApiResponse<T>> {
  const response = await fetch(base + path, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: response.status, data: data as T };
}

export function expectOk<T>(response: ApiResponse<T>, label: string): T {
  assert.equal(
    response.status,
    200,
    `${label} 期望 200，实际 ${response.status}: ${JSON.stringify(response.data)}`,
  );
  return response.data;
}

export async function register(base: string, prefix: string): Promise<Account> {
  const username = uniqueName(prefix);
  const response = await api<{ token: string; user: { id: string; username: string } }>(
    base,
    '/api/auth/register',
    { method: 'POST', body: { username, password: 'pass1234' } },
  );
  const data = expectOk(response, `注册 ${username}`);
  return { token: data.token, userId: data.user.id, username: data.user.username };
}

export async function listGames(base: string): Promise<GameMeta[]> {
  return expectOk(await api<GameMeta[]>(base, '/api/games'), '读取游戏列表');
}

export async function createRoom(base: string, token: string): Promise<RoomView> {
  return expectOk(
    await api<RoomView>(base, '/api/rooms', { method: 'POST', token }),
    '创建房间',
  );
}

export async function joinRoom(base: string, token: string, code: string): Promise<RoomView> {
  return expectOk(
    await api<RoomView>(base, `/api/rooms/${code}/join`, { method: 'POST', token }),
    '加入房间',
  );
}

export async function getRoom(
  base: string,
  token: string,
  code: string,
): Promise<ApiResponse<RoomView>> {
  return api<RoomView>(base, `/api/rooms/${code}`, { token });
}

export async function selectGame(
  base: string,
  token: string,
  code: string,
  gameId: string,
): Promise<ApiResponse<RoomView>> {
  return api<RoomView>(base, `/api/rooms/${code}/game`, {
    method: 'POST',
    token,
    body: { gameId },
  });
}

export async function setReady(
  base: string,
  token: string,
  code: string,
  ready: boolean,
): Promise<RoomView> {
  return expectOk(
    await api<RoomView>(base, `/api/rooms/${code}/ready`, {
      method: 'POST',
      token,
      body: { ready },
    }),
    '切换准备',
  );
}

export async function startRoom(
  base: string,
  token: string,
  code: string,
): Promise<ApiResponse<RoomView>> {
  return api<RoomView>(base, `/api/rooms/${code}/start`, { method: 'POST', token });
}

export async function finishRoom(
  base: string,
  token: string,
  code: string,
): Promise<ApiResponse<RoomView>> {
  return api<RoomView>(base, `/api/rooms/${code}/finish`, { method: 'POST', token });
}

export async function leaveRoom(base: string, token: string): Promise<ApiResponse<unknown>> {
  return api(base, '/api/rooms/leave', { method: 'POST', token });
}

export async function endVote(
  base: string,
  token: string,
  code: string,
): Promise<ApiResponse<RoomView>> {
  return api<RoomView>(base, `/api/rooms/${code}/end-vote`, { method: 'POST', token });
}

export async function rematchVote(
  base: string,
  token: string,
  code: string,
): Promise<ApiResponse<RoomView>> {
  return api<RoomView>(base, `/api/rooms/${code}/rematch-vote`, { method: 'POST', token });
}

export async function castVote(
  base: string,
  token: string,
  code: string,
  decision: 'yes' | 'no',
): Promise<ApiResponse<RoomView>> {
  return api<RoomView>(base, `/api/rooms/${code}/vote`, {
    method: 'POST',
    token,
    body: { decision },
  });
}

export async function backToWaiting(
  base: string,
  token: string,
  code: string,
): Promise<ApiResponse<RoomView>> {
  return api<RoomView>(base, `/api/rooms/${code}/back-to-waiting`, { method: 'POST', token });
}

export async function kickPlayer(
  base: string,
  token: string,
  code: string,
  targetUserId: string,
): Promise<ApiResponse<RoomView>> {
  return api<RoomView>(base, `/api/rooms/${code}/kick`, {
    method: 'POST',
    token,
    body: { userId: targetUserId },
  });
}

export async function myRoom(
  base: string,
  token: string,
): Promise<ApiResponse<{ mine: RoomView | null }>> {
  return api<{ mine: RoomView | null }>(base, '/api/rooms', { token });
}

export async function recordsFor(
  base: string,
  token: string,
  gameId: string,
): Promise<RecordPage> {
  return expectOk(
    await api<RecordPage>(base, `/api/me/records?gameId=${encodeURIComponent(gameId)}`, {
      token,
    }),
    `读取 ${gameId} 战绩`,
  );
}

export async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  label: string,
  timeoutMs = 10_000,
  intervalMs = 60,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  while (Date.now() < deadline) {
    last = await fn();
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`等待超时：${label}`);
}

export async function waitForRoom(
  base: string,
  token: string,
  code: string,
  predicate: (room: RoomView) => boolean,
  label: string,
  timeoutMs = 10_000,
): Promise<RoomView> {
  return waitFor(
    async () => expectOk(await getRoom(base, token, code), '读取房间'),
    predicate,
    label,
    timeoutMs,
  );
}
