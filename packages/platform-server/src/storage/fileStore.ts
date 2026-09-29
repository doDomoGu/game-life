import fs from 'node:fs/promises';
import path from 'node:path';

let writeQueue: Promise<void> = Promise.resolve();

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return fallback;
    }
    throw err;
  }
}

export function writeJsonFileAtomic<T>(filePath: string, data: T): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmp, filePath);
  });
  return writeQueue;
}
