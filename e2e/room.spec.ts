import { expect, test, type Browser, type APIRequestContext, type Page } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3210';

let sequence = 0;

function uniqueName(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36).slice(-5)}_${sequence}`.slice(0, 20);
}

async function register(
  request: APIRequestContext,
  prefix: string,
): Promise<{ token: string; user: { id: string; username: string } }> {
  const response = await request.post('/api/auth/register', {
    data: { username: uniqueName(prefix), password: 'pass1234' },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function openAs(browser: Browser, token: string): Promise<Page> {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: 'zh-CN',
  });
  await context.addInitScript((value: string) => {
    localStorage.setItem('game-life-token', value);
  }, token);
  return context.newPage();
}

async function expectStatus(page: Page, text: string): Promise<void> {
  await expect(page.locator('.room__top .sub')).toContainText(text, { timeout: 10_000 });
}

test('两名玩家从建房、准备、开始、投票中止到再来一局，刷新与守卫都保持房间', async ({
  browser,
  request,
}) => {
  const alice = await register(request, 'ea');
  const bob = await register(request, 'eb');
  const pageA = await openAs(browser, alice.token);
  const pageB = await openAs(browser, bob.token);

  await pageA.goto('/');
  await pageA.getByRole('button', { name: '创建房间' }).click();
  await expect(pageA).toHaveURL(/\/room\/[0-9A-F]{6}/);
  const code = new URL(pageA.url()).pathname.split('/').pop()!;

  await pageB.goto('/');
  await pageB.getByPlaceholder('输入房间号加入').fill(code);
  await pageB.getByRole('button', { name: '加入' }).click();
  await expect(pageB).toHaveURL(new RegExp(`/room/${code}`));

  await pageA.getByRole('combobox').selectOption('hanabi');
  await pageB.getByRole('button', { name: '准备' }).click();
  const start = pageA.getByRole('button', { name: '开始游戏' });
  await expect(start).toBeEnabled({ timeout: 10_000 });
  await start.click();

  await expectStatus(pageA, '对局中');
  await expectStatus(pageB, '对局中');
  await expect(pageA.getByRole('button', { name: '离开' })).toHaveCount(0);
  await expect(pageA.getByRole('button', { name: '申请结束' })).toBeVisible();

  pageA.once('dialog', (dialog) => void dialog.accept());
  await pageA.getByRole('button', { name: '申请结束' }).click();
  await expect(pageB.getByText(/申请结束对局/)).toBeVisible({ timeout: 10_000 });
  await pageB.getByRole('button', { name: '同意', exact: true }).click();
  await expect(pageA.getByRole('heading', { name: '本局已中止' })).toBeVisible({
    timeout: 10_000,
  });
  await expect(pageB.getByRole('heading', { name: '本局已中止' })).toBeVisible({
    timeout: 10_000,
  });

  await pageA.getByRole('button', { name: '再来一局' }).click();
  await expect(pageB.getByRole('button', { name: '同意', exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await pageB.getByRole('button', { name: '同意', exact: true }).click();
  await expectStatus(pageA, '对局中');
  await expectStatus(pageB, '对局中');
  await expect(pageA.getByText('提示 8/8').first()).toBeVisible();

  await pageA.reload();
  await expect(pageA).toHaveURL(new RegExp(`/room/${code}`));
  await expectStatus(pageA, '对局中');
  await expect(pageA.getByText('提示 8/8').first()).toBeVisible();

  // 已在房间中访问大厅会被守卫拉回房间
  await pageA.goto('/');
  await expect(pageA).toHaveURL(new RegExp(`/room/${code}`));
  await expectStatus(pageA, '对局中');
});

test('单人房：自动回房、结算后重开、对局中确认放弃', async ({ browser, request }) => {
  const carol = await register(request, 'ec');
  const headers = { Authorization: `Bearer ${carol.token}` };
  const created = await request.post('/api/rooms', { headers });
  expect(created.ok()).toBeTruthy();
  const room = (await created.json()) as { code: string; status: string };
  expect(room.status).toBe('waiting');

  expect(
    (
      await request.post(`/api/rooms/${room.code}/game`, {
        headers,
        data: { gameId: 'sudoku' },
      })
    ).ok(),
  ).toBeTruthy();
  expect((await request.post(`/api/rooms/${room.code}/start`, { headers })).ok()).toBeTruthy();
  expect((await request.post(`/api/rooms/${room.code}/finish`, { headers })).ok()).toBeTruthy();

  const page = await openAs(browser, carol.token);
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/room/${room.code}`));
  await expectStatus(page, '本局已结束');

  await page.getByRole('button', { name: '再来一局' }).click();
  await expectStatus(page, '对局中');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '离开' }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
  await expect(page.getByRole('button', { name: '创建房间' })).toBeVisible();
});
