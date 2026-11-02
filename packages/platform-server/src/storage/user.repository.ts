import path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { UserStored } from '@game-life/shared';
import { getPlatformRuntime } from '../config/runtime.js';
import { readJsonFile, writeJsonFileAtomic } from './fileStore.js';

const file = () => path.join(getPlatformRuntime().dataDir, 'users.json');

type UsersFile = { users: UserStored[] };

function normalize(user: UserStored): UserStored {
  const nickname =
    typeof user.nickname === 'string' && user.nickname.trim()
      ? user.nickname
      : user.username;
  return {
    ...user,
    nickname,
    avatarUrl: typeof user.avatarUrl === 'string' && user.avatarUrl ? user.avatarUrl : null,
  };
}

export async function findUserByUsername(username: string): Promise<UserStored | undefined> {
  const data = await readJsonFile<UsersFile>(file(), { users: [] });
  const found = data.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  return found ? normalize(found) : undefined;
}

export async function findUserById(id: string): Promise<UserStored | undefined> {
  const data = await readJsonFile<UsersFile>(file(), { users: [] });
  const found = data.users.find((u) => u.id === id);
  return found ? normalize(found) : undefined;
}

export async function listUsers(): Promise<UserStored[]> {
  const data = await readJsonFile<UsersFile>(file(), { users: [] });
  return data.users.map(normalize).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createUser(username: string, passwordHash: string): Promise<UserStored> {
  const data = await readJsonFile<UsersFile>(file(), { users: [] });
  const user: UserStored = {
    id: uuid(),
    username,
    nickname: username,
    avatarUrl: null,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  await writeJsonFileAtomic(file(), data);
  return user;
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<UserStored, 'nickname' | 'avatarUrl' | 'passwordHash'>>,
): Promise<UserStored | undefined> {
  const data = await readJsonFile<UsersFile>(file(), { users: [] });
  const index = data.users.findIndex((u) => u.id === id);
  if (index < 0) return undefined;
  const next = { ...normalize(data.users[index]!), ...patch };
  data.users[index] = next;
  await writeJsonFileAtomic(file(), data);
  return next;
}
