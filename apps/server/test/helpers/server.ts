import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');

export interface TestServer {
  baseUrl: string;
  dataDir: string;
  logs(): string;
  close(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.unref();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      socket.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`测试服务提前退出，exitCode=${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      // 还没起来，继续等
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('等待测试服务启动超时');
}

/**
 * 用临时数据目录和随机端口启动真实服务端。
 * 测试时长通过环境变量压缩，生产默认值不受影响。
 */
export async function startTestServer(): Promise<TestServer> {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'game-life-test-'));
  const port = await freePort();
  const output: string[] = [];

  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(port),
      JWT_SECRET: 'game-life-test-secret',
      GAME_LIFE_VOTE_DURATION_MS: '1200',
      GAME_LIFE_ONLINE_WINDOW_MS: '15000',
      DRAW_GUESS_ROUND_COUNT: '2',
      DRAW_GUESS_DRAW_MS: '1200',
      DRAW_GUESS_REVEAL_MS: '150',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk) => output.push(String(chunk)));
  child.stderr?.on('data', (chunk) => output.push(String(chunk)));

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForHealth(baseUrl, child);
  } catch (err) {
    child.kill('SIGKILL');
    await rm(dataDir, { recursive: true, force: true });
    throw new Error(`${(err as Error).message}\n--- 服务输出 ---\n${output.join('')}`);
  }

  let closed = false;
  return {
    baseUrl,
    dataDir,
    logs: () => output.join(''),
    async close() {
      if (closed) return;
      closed = true;
      child.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      if (child.exitCode == null) child.kill('SIGKILL');
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
