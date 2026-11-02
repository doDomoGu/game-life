export interface RegisterBody {
  username: string;
  password: string;
}

export interface LoginBody {
  username: string;
  password: string;
}

export interface UpdateProfileBody {
  nickname: string;
}

export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateAvatarBody {
  /** data:image/... 的 Data URL；传 null 清除头像 */
  dataUrl: string | null;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    username: string;
    nickname: string;
    avatarUrl: string | null;
    createdAt: string;
  };
}
