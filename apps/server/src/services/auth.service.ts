import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AuthResponse, UserPublic } from '@game-life/shared';
import { env } from '../config/env.js';
import * as userRepo from '../storage/user.repository.js';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const MIN_PASSWORD = 6;

export function toPublic(user: { id: string; username: string; createdAt: string }): UserPublic {
  return { id: user.id, username: user.username, createdAt: user.createdAt };
}

function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: '30d' });
}

export async function register(username: string, password: string): Promise<AuthResponse> {
  if (!USERNAME_RE.test(username)) {
    throw Object.assign(new Error('用户名须为 3～20 位字母、数字或下划线'), { statusCode: 400 });
  }
  if (password.length < MIN_PASSWORD) {
    throw Object.assign(new Error(`密码至少 ${MIN_PASSWORD} 位`), { statusCode: 400 });
  }
  const existing = await userRepo.findUserByUsername(username);
  if (existing) {
    throw Object.assign(new Error('用户名已存在'), { statusCode: 409 });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await userRepo.createUser(username, passwordHash);
  return {
    token: signToken(user.id),
    user: { id: user.id, username: user.username },
  };
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const user = await userRepo.findUserByUsername(username);
  if (!user) {
    throw Object.assign(new Error('用户名或密码错误'), { statusCode: 401 });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw Object.assign(new Error('用户名或密码错误'), { statusCode: 401 });
  }
  return {
    token: signToken(user.id),
    user: { id: user.id, username: user.username },
  };
}

export function verifyToken(token: string): { userId: string } {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
    return { userId: payload.sub };
  } catch {
    throw Object.assign(new Error('未登录或 token 无效'), { statusCode: 401 });
  }
}
