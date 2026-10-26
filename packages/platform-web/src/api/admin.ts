import axios from 'axios';
import { useAdminStore } from '../stores/admin.js';

export interface AdminUserRow {
  id: string;
  username: string;
  createdAt: string;
}

const adminApi = axios.create({
  baseURL: `${import.meta.env.BASE_URL}api`,
  timeout: 15000,
});

adminApi.interceptors.request.use((config) => {
  const admin = useAdminStore();
  if (admin.token) config.headers.Authorization = `Bearer ${admin.token}`;
  return config;
});

export async function adminLogin(username: string, password: string) {
  const { data } = await adminApi.post<{ token: string; username: string }>('/admin/login', {
    username,
    password,
  });
  return data;
}

export async function fetchAdminUsers() {
  const { data } = await adminApi.get<{ users: AdminUserRow[] }>('/admin/users');
  return data.users;
}
