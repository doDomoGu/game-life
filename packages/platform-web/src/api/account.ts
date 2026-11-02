import type {
  ChangePasswordBody,
  UpdateAvatarBody,
  UpdateProfileBody,
  UserPublic,
} from '@game-life/shared';
import { api } from './client.js';

export async function updateProfile(nickname: string): Promise<UserPublic> {
  const body: UpdateProfileBody = { nickname };
  const { data } = await api.patch<UserPublic>('/me/profile', body);
  return data;
}

export async function updateAvatar(dataUrl: string | null): Promise<UserPublic> {
  const body: UpdateAvatarBody = { dataUrl };
  const { data } = await api.post<UserPublic>('/me/avatar', body);
  return data;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const body: ChangePasswordBody = { currentPassword, newPassword };
  await api.post('/me/password', body);
}
