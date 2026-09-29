export interface UserPublic {
  id: string;
  username: string;
  createdAt: string;
}

export interface UserStored extends UserPublic {
  passwordHash: string;
}
