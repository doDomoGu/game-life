import path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { UserStored } from '@game-life/shared';
import { env } from '../config/env.js';
import { readJsonFile, writeJsonFileAtomic } from './fileStore.js';

const file = () => path.join(env.dataDir, 'users.json');

type UsersFile = { users: UserStored[] };

export async function findUserByUsername(username: string): Promise<UserStored | undefined> {
  const data = await readJsonFile<UsersFile>(file(), { users: [] });
  return data.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

export async function findUserById(id: string): Promise<UserStored | undefined> {
  const data = await readJsonFile<UsersFile>(file(), { users: [] });
  return data.users.find((u) => u.id === id);
}

export async function createUser(username: string, passwordHash: string): Promise<UserStored> {
  const data = await readJsonFile<UsersFile>(file(), { users: [] });
  const user: UserStored = {
    id: uuid(),
    username,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  await writeJsonFileAtomic(file(), data);
  return user;
}
