import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { api, expectOk, register } from './helpers/api.js';
import { startTestServer, type TestServer } from './helpers/server.js';

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZbVQAAAAASUVORK5CYII=';

test('账号中心：默认昵称、修改昵称并同步到房间', async () => {
  const account = await register(server.baseUrl, 'acc');
  const me = expectOk(
    await api(server.baseUrl, '/api/auth/me', { token: account.token }),
    '读取当前用户',
  ) as { username: string; nickname: string; avatarUrl: string | null };
  assert.equal(me.nickname, account.username, '注册时昵称默认等于登录账号');
  assert.equal(me.avatarUrl, null);

  const updated = expectOk(
    await api(server.baseUrl, '/api/me/profile', {
      method: 'PATCH',
      token: account.token,
      body: { nickname: '测试昵称' },
    }),
    '修改昵称',
  ) as { nickname: string };
  assert.equal(updated.nickname, '测试昵称');

  const room = expectOk(
    await api(server.baseUrl, '/api/rooms', { method: 'POST', token: account.token }),
    '创建房间',
  ) as { code: string; players: Array<{ username: string }> };
  assert.equal(room.players[0]?.username, '测试昵称', '房间内显示新昵称');

  const empty = await api(server.baseUrl, '/api/me/profile', {
    method: 'PATCH',
    token: account.token,
    body: { nickname: '   ' },
  });
  assert.equal(empty.status, 400);
  const tooLong = await api(server.baseUrl, '/api/me/profile', {
    method: 'PATCH',
    token: account.token,
    body: { nickname: 'a'.repeat(21) },
  });
  assert.equal(tooLong.status, 400);
});

test('账号中心：头像上传、清空与格式校验', async () => {
  const account = await register(server.baseUrl, 'ava');
  const uploaded = expectOk(
    await api(server.baseUrl, '/api/me/avatar', {
      method: 'POST',
      token: account.token,
      body: { dataUrl: PNG_1X1 },
    }),
    '上传头像',
  ) as { avatarUrl: string | null };
  assert.equal(uploaded.avatarUrl, PNG_1X1);

  const invalid = await api(server.baseUrl, '/api/me/avatar', {
    method: 'POST',
    token: account.token,
    body: { dataUrl: 'data:text/plain;base64,AAAA' },
  });
  assert.equal(invalid.status, 400);
  const tooLarge = await api(server.baseUrl, '/api/me/avatar', {
    method: 'POST',
    token: account.token,
    body: { dataUrl: `data:image/png;base64,${'A'.repeat(400_001)}` },
  });
  assert.equal(tooLarge.status, 400);

  const cleared = expectOk(
    await api(server.baseUrl, '/api/me/avatar', {
      method: 'POST',
      token: account.token,
      body: { dataUrl: null },
    }),
    '移除头像',
  ) as { avatarUrl: string | null };
  assert.equal(cleared.avatarUrl, null);
});

test('账号中心：修改密码需要当前密码，旧密码失效', async () => {
  const account = await register(server.baseUrl, 'pwd');
  const wrong = await api(server.baseUrl, '/api/me/password', {
    method: 'POST',
    token: account.token,
    body: { currentPassword: 'wrong-pass', newPassword: 'newpass123' },
  });
  assert.equal(wrong.status, 400);

  const changed = await api(server.baseUrl, '/api/me/password', {
    method: 'POST',
    token: account.token,
    body: { currentPassword: 'pass1234', newPassword: 'newpass123' },
  });
  assert.equal(changed.status, 200);

  const oldLogin = await api(server.baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username: account.username, password: 'pass1234' },
  });
  assert.equal(oldLogin.status, 401);
  const newLogin = await api(server.baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username: account.username, password: 'newpass123' },
  });
  assert.equal(newLogin.status, 200);

  const me = await api(server.baseUrl, '/api/auth/me', { token: account.token });
  assert.equal(me.status, 200, '改密码后原 token 仍然有效');
});

test('账号中心接口需要登录', async () => {
  const response = await api(server.baseUrl, '/api/me/profile', {
    method: 'PATCH',
    body: { nickname: 'x' },
  });
  assert.equal(response.status, 401);
});
