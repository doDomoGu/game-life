import type { AuthResponse, LoginBody, RegisterBody, UserPublic } from '@game-life/shared';
import { api } from './client';

export async function register(body: RegisterBody) {
  const { data } = await api.post<AuthResponse>('/auth/register', body);
  return data;
}

export async function login(body: LoginBody) {
  const { data } = await api.post<AuthResponse>('/auth/login', body);
  return data;
}

export async function fetchMe() {
  const { data } = await api.get<UserPublic>('/auth/me');
  return data;
}
