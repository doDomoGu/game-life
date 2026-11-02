export interface UserPublic {
  id: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface UserStored extends UserPublic {
  passwordHash: string;
}
