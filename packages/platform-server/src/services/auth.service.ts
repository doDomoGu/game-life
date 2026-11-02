import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AuthResponse, UserPublic } from '@game-life/shared';
import { getPlatformRuntime } from '../config/runtime.js';
import * as userRepo from '../storage/user.repository.js';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 72;
const MAX_NICKNAME = 20;
const MAX_AVATAR_CHARS = 400_000;
const AVATAR_RE = /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/;

function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}

export function toPublic(user: {
  id: string;
  username: string;
  nickname?: string;
  avatarUrl?: string | null;
  createdAt: string;
}): UserPublic {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname?.trim() || user.username,
    avatarUrl: user.avatarUrl || null,
    createdAt: user.createdAt,
  };
}

function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, getPlatformRuntime().jwtSecret, { expiresIn: '30d' });
}

export async function register(username: string, password: string): Promise<AuthResponse> {
  if (!USERNAME_RE.test(username)) {
    fail('用户名须为 3～20 位字母、数字或下划线');
  }
  if (password.length < MIN_PASSWORD) {
    fail(`密码至少 ${MIN_PASSWORD} 位`);
  }
  const existing = await userRepo.findUserByUsername(username);
  if (existing) {
    fail('用户名已存在', 409);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await userRepo.createUser(username, passwordHash);
  return {
    token: signToken(user.id),
    user: toPublic(user),
  };
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const user = await userRepo.findUserByUsername(username);
  if (!user) fail('用户名或密码错误', 401);
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) fail('用户名或密码错误', 401);
  return {
    token: signToken(user.id),
    user: toPublic(user),
  };
}

export async function updateProfile(userId: string, rawNickname: string): Promise<UserPublic> {
  const nickname = String(rawNickname ?? '').trim();
  if (!nickname) fail('昵称不能为空');
  if ([...nickname].length > MAX_NICKNAME) fail(`昵称最多 ${MAX_NICKNAME} 个字符`);
  if (/[\u0000-\u001f\u007f]/.test(nickname)) fail('昵称不能包含换行或控制字符');
  const user = await userRepo.updateUser(userId, { nickname });
  if (!user) fail('用户不存在', 404);
  return toPublic(user);
}

export async function updateAvatar(userId: string, dataUrl: string | null): Promise<UserPublic> {
  let avatarUrl: string | null = null;
  if (dataUrl != null) {
    if (typeof dataUrl !== 'string' || !AVATAR_RE.test(dataUrl)) {
      fail('头像格式不支持，请上传 PNG、JPG 或 WebP');
    }
    if (dataUrl.length > MAX_AVATAR_CHARS) {
      fail('头像图片太大，请换一张更小的图片');
    }
    avatarUrl = dataUrl;
  }
  const user = await userRepo.updateUser(userId, { avatarUrl });
  if (!user) fail('用户不存在', 404);
  return toPublic(user);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<UserPublic> {
  const user = await userRepo.findUserById(userId);
  if (!user) fail('用户不存在', 404);
  if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    fail('当前密码不正确');
  }
  if (newPassword.length < MIN_PASSWORD) fail(`新密码至少 ${MIN_PASSWORD} 位`);
  if (newPassword.length > MAX_PASSWORD) fail(`新密码最多 ${MAX_PASSWORD} 位`);
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const updated = await userRepo.updateUser(userId, { passwordHash });
  if (!updated) fail('用户不存在', 404);
  return toPublic(updated);
}

export function verifyToken(token: string): { userId: string } {
  try {
    const payload = jwt.verify(token, getPlatformRuntime().jwtSecret) as { sub: string };
    return { userId: payload.sub };
  } catch {
    fail('未登录或 token 无效', 401);
  }
}

/** 非 HTTP 入口（如 WebSocket）复用同一套鉴权 */
export async function authenticateToken(token: string) {
  if (!token) fail('未登录', 401);
  const { userId } = verifyToken(token);
  const user = await userRepo.findUserById(userId);
  if (!user) fail('用户不存在', 401);
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname?.trim() || user.username,
    avatarUrl: user.avatarUrl || null,
  };
}
