import bcrypt from 'bcryptjs';

/** 固定管理员，不写入 users.json。密码用与前台相同的 bcrypt 校验。 */
const ADMIN_USERNAME = 'dodomogu';
const ADMIN_PASSWORD = 'bb890116';

let passwordHash: Promise<string> | undefined;

function hashPassword(): Promise<string> {
  passwordHash ??= bcrypt.hash(ADMIN_PASSWORD, 10);
  return passwordHash;
}

export async function matchesAdmin(username: string, password: string): Promise<boolean> {
  if (username !== ADMIN_USERNAME) return false;
  return bcrypt.compare(password, await hashPassword());
}

export const adminUsername = ADMIN_USERNAME;
