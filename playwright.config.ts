import { defineConfig } from '@playwright/test';

const port = 3210;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // 本机直接复用已安装的 Chrome；CI 可用 PLAYWRIGHT_CHANNEL=chromium 覆盖
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: 'zh-CN',
  },
  webServer: {
    command:
      'rm -rf /tmp/game-life-e2e-data && DATA_DIR=/tmp/game-life-e2e-data PORT=3210 JWT_SECRET=e2e-secret GAME_LIFE_VOTE_DURATION_MS=15000 node --import tsx src/index.ts',
    cwd: 'apps/server',
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
