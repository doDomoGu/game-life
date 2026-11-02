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

test('玩家列表每行展示 4 人', async ({ browser, request }) => {
  const accounts = [];
  for (const prefix of ['r1', 'r2', 'r3', 'r4']) {
    accounts.push(await register(request, prefix));
  }
  const host = accounts[0]!;
  const guests = accounts.slice(1);
  const headers = { Authorization: `Bearer ${host.token}` };
  const created = await request.post('/api/rooms', { headers });
  expect(created.ok()).toBeTruthy();
  const room = (await created.json()) as { code: string };
  for (const guest of guests) {
    const joined = await request.post(`/api/rooms/${room.code}/join`, {
      headers: { Authorization: `Bearer ${guest.token}` },
    });
    expect(joined.ok()).toBeTruthy();
  }

  const page = await openAs(browser, host.token);
  await page.goto(`/room/${room.code}`);
  const cards = page.locator('.players li');
  await expect(cards).toHaveCount(4);
  const boxes = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width) };
    }),
  );
  expect(new Set(boxes.map((box) => box.y)).size).toBe(1);
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
  expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);
  expect(boxes[2]!.x).toBeLessThan(boxes[3]!.x);
  expect(Math.max(...boxes.map((box) => box.width)) - Math.min(...boxes.map((box) => box.width))).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/room-four-players.png' });
});

test('猜颜色：单人配置、提交猜测和反馈展示', async ({ browser, request }) => {
  const user = await register(request, 'cg');
  const headers = { Authorization: `Bearer ${user.token}` };
  const created = await request.post('/api/rooms', { headers });
  expect(created.ok()).toBeTruthy();
  const room = (await created.json()) as { code: string };
  expect(
    (
      await request.post(`/api/rooms/${room.code}/game`, {
        headers,
        data: { gameId: 'color-guess' },
      })
    ).ok(),
  ).toBeTruthy();
  expect((await request.post(`/api/rooms/${room.code}/start`, { headers })).ok()).toBeTruthy();

  const page = await openAs(browser, user.token);
  await page.goto(`/room/${room.code}`);
  await expect(page.getByText('配置中')).toBeVisible();
  await page.getByRole('button', { name: /10 种/ }).click();
  await expect(page.getByText(/10 色/)).toBeVisible();
  await page.getByRole('button', { name: /^允许/ }).click();
  await expect(page.getByText(/允许重复/)).toBeVisible();
  await page.getByRole('button', { name: '开始对局' }).click();

  await expect(page.getByText('进行中')).toBeVisible();
  for (const name of ['红', '橙', '黄', '绿']) {
    await page.getByRole('button', { name, exact: true }).click();
  }
  await page.getByRole('button', { name: '提交猜测' }).click();
  await expect(page.getByText(/全对/)).toBeVisible();
  await expect(page.getByText('1 / 10')).toBeVisible();
  await expect(page.getByText('正确密码')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/color-guess-solo.png' });
});

test('猜颜色：双人出题，出题者设密码、答题者猜中获胜', async ({ browser, request }) => {
  const alice = await register(request, 'csa');
  const bob = await register(request, 'csb');
  const headersA = { Authorization: `Bearer ${alice.token}` };
  const headersB = { Authorization: `Bearer ${bob.token}` };
  const created = await request.post('/api/rooms', { headers: headersA });
  expect(created.ok()).toBeTruthy();
  const room = (await created.json()) as { code: string };
  expect(
    (await request.post(`/api/rooms/${room.code}/join`, { headers: headersB })).ok(),
  ).toBeTruthy();
  expect(
    (
      await request.post(`/api/rooms/${room.code}/game`, {
        headers: headersA,
        data: { gameId: 'color-guess' },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await request.post(`/api/rooms/${room.code}/ready`, {
        headers: headersB,
        data: { ready: true },
      })
    ).ok(),
  ).toBeTruthy();
  expect((await request.post(`/api/rooms/${room.code}/start`, { headers: headersA })).ok()).toBeTruthy();

  const pageA = await openAs(browser, alice.token);
  const pageB = await openAs(browser, bob.token);
  await pageA.goto(`/room/${room.code}`);
  await pageB.goto(`/room/${room.code}`);

  await pageA.getByRole('button', { name: /双人出题/ }).click();
  await pageA.getByRole('button', { name: '我出题' }).click();
  await pageA.getByRole('button', { name: '开始对局' }).click();
  await expect(pageA.getByText('设置 4 位颜色密码')).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByText('对方正在设置密码…')).toBeVisible({ timeout: 10_000 });

  for (const name of ['红', '橙', '黄', '绿']) {
    await pageA.getByRole('button', { name, exact: true }).click();
  }
  await pageA.getByRole('button', { name: '确认密码' }).click();
  await expect(pageA.getByText('你设置的密码')).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByText('第 1 次猜测')).toBeVisible({ timeout: 10_000 });

  for (const name of ['红', '橙', '黄', '绿']) {
    await pageB.getByRole('button', { name, exact: true }).click();
  }
  await pageB.getByRole('button', { name: '提交猜测' }).click();
  await expect(pageB.getByText('你赢了')).toBeVisible({ timeout: 10_000 });
  await expect(pageA.getByText(`${bob.user.username} 获胜`)).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByText('正确密码')).toBeVisible();
});

test('首页积分榜：切换游戏和数独难度', async ({ browser, request }) => {
  const alice = await register(request, 'lba');
  const bob = await register(request, 'lbb');
  for (const [account, seconds] of [
    [alice, 30],
    [bob, 50],
  ] as const) {
    expect(
      (
        await request.post('/api/games/sudoku/records', {
          headers: { Authorization: `Bearer ${account.token}` },
          data: {
            rawScore: seconds,
            durationMs: seconds * 1000,
            meta: {
              kind: 'sudoku',
              difficulty: 'easy',
              puzzleId: 1,
              timeMs: seconds * 1000,
            },
          },
        })
      ).ok(),
    ).toBeTruthy();
  }

  const page = await openAs(browser, alice.token);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '积分榜' })).toBeVisible();
  await expect(page.locator('.score-name')).toContainText([alice.user.username, bob.user.username]);
  await page.getByRole('button', { name: /普通/ }).click();
  await expect(page.getByText('还没有人上榜')).toBeVisible();

  await page.getByRole('combobox', { name: '选择积分榜游戏' }).selectOption('bingo');
  await expect(page.locator('.scores__sub')).toContainText('Bingo');
  await page.getByRole('combobox', { name: '选择积分榜游戏' }).selectOption('sudoku');
  await page.getByRole('button', { name: /简单/ }).click();
  await expect(page.locator('.score-name').first()).toContainText(alice.user.username);
  await page.screenshot({ path: 'test-results/home-leaderboard.png' });
});

test('数独固定题库：选择难度和任意题目开始', async ({ browser, request }) => {
  const user = await register(request, 'sudoku');
  const headers = { Authorization: `Bearer ${user.token}` };
  expect(
    (
      await request.post('/api/games/sudoku/records', {
        headers,
        data: {
          rawScore: 30,
          durationMs: 30_000,
          meta: { kind: 'sudoku', difficulty: 'easy', puzzleId: 2, timeMs: 30_000 },
        },
      })
    ).ok(),
  ).toBeTruthy();
  const created = await request.post('/api/rooms', { headers });
  expect(created.ok()).toBeTruthy();
  const room = (await created.json()) as { code: string };
  expect(
    (
      await request.post(`/api/rooms/${room.code}/game`, {
        headers,
        data: { gameId: 'sudoku' },
      })
    ).ok(),
  ).toBeTruthy();
  expect((await request.post(`/api/rooms/${room.code}/start`, { headers })).ok()).toBeTruthy();

  const page = await openAs(browser, user.token);
  await page.goto(`/room/${room.code}`);
  await expect(page.locator('.puzzle')).toHaveCount(30);
  await expect(page.locator('.puzzle').nth(1)).toContainText('0:30');
  await page.getByRole('button', { name: /普通/ }).click();
  await expect(page.locator('.puzzle')).toHaveCount(30);
  await expect(page.locator('.puzzle').first()).toContainText('未完成');
  await page.screenshot({ path: 'test-results/sudoku-list.png' });
  await page.locator('.puzzle').first().click();
  await expect(page.locator('.picker')).toBeHidden();
  await expect(page.locator('.stage')).toBeVisible();
  await expect(page.getByRole('button', { name: '结束游戏' })).toBeVisible();
  await page.screenshot({ path: 'test-results/sudoku-picker.png' });
});

test('账号中心：修改昵称、上传头像、修改密码和退出账号', async ({ browser, request }) => {
  const user = await register(request, 'acct');
  expect(
    (
      await request.post('/api/games/sudoku/records', {
        headers: { Authorization: `Bearer ${user.token}` },
        data: {
          rawScore: 30,
          durationMs: 30_000,
          meta: { kind: 'sudoku', difficulty: 'easy', puzzleId: 1, timeMs: 30_000 },
        },
      })
    ).ok(),
  ).toBeTruthy();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZbVQAAAAASUVORK5CYII=',
    'base64',
  );
  const page = await openAs(browser, user.token);
  await page.goto('/');
  await page.getByRole('button', { name: '账号中心' }).click();
  await expect(page.getByRole('dialog', { name: '账号中心' })).toBeVisible();
  await expect(page.getByText('我的积分')).toBeVisible();
  await expect(page.getByText(/1 \/ 30/).first()).toBeVisible();

  await page.getByPlaceholder('输入昵称').fill('新昵称');
  await page.getByRole('button', { name: '保存昵称' }).click();
  await expect(page.getByText('昵称已更新')).toBeVisible();
  await expect(page.getByText('你好，新昵称')).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await expect(page.getByText('头像已更新')).toBeVisible();
  await expect(page.locator('.avatar--lg img')).toBeVisible();

  await page.getByLabel('当前密码').fill('pass1234');
  await page.getByLabel('新密码', { exact: true }).fill('newpass123');
  await page.getByLabel('确认新密码').fill('newpass123');
  await page.getByRole('button', { name: '修改密码' }).click();
  await expect(page.getByText('密码已修改')).toBeVisible();
  await page.screenshot({ path: 'test-results/account-drawer.png' });

  const oldLogin = await request.post('/api/auth/login', {
    data: { username: user.user.username, password: 'pass1234' },
  });
  expect(oldLogin.status()).toBe(401);
  const newLogin = await request.post('/api/auth/login', {
    data: { username: user.user.username, password: 'newpass123' },
  });
  expect(newLogin.ok()).toBeTruthy();

  await page.getByRole('button', { name: '退出账号' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('单人房：自动回房、结算后重开、对局中结束游戏回到等待房', async ({ browser, request }) => {
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
  await page.getByRole('button', { name: '结束游戏' }).click();
  await expectStatus(page, '等待中');
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible();

  await page.getByRole('button', { name: '离开' }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
  await expect(page.getByRole('button', { name: '创建房间' })).toBeVisible();
});

test('华容道单人房可以在游戏内结束游戏，回到房间重新选游戏', async ({ browser, request }) => {
  const dave = await register(request, 'ek');
  const headers = { Authorization: `Bearer ${dave.token}` };
  const created = await request.post('/api/rooms', { headers });
  expect(created.ok()).toBeTruthy();
  const room = (await created.json()) as { code: string };
  expect(
    (
      await request.post(`/api/rooms/${room.code}/game`, {
        headers,
        data: { gameId: 'klotski' },
      })
    ).ok(),
  ).toBeTruthy();
  expect((await request.post(`/api/rooms/${room.code}/start`, { headers })).ok()).toBeTruthy();

  const page = await openAs(browser, dave.token);
  await page.goto(`/room/${room.code}`);
  await expectStatus(page, '对局中');
  await expect(page.getByRole('button', { name: '结束游戏' })).toBeVisible();
  await expect(page.getByRole('button', { name: '离开' })).toHaveCount(0);

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '结束游戏' }).click();
  await expectStatus(page, '等待中');
  await expect(page.getByRole('combobox')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible();
  await page.screenshot({ path: 'test-results/klotski-end-game.png' });
});
