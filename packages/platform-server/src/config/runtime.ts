export interface PlatformRuntimeConfig {
  dataDir: string;
  jwtSecret: string;
  port: number;
}

let config: PlatformRuntimeConfig | null = null;

export function configurePlatformRuntime(next: PlatformRuntimeConfig) {
  config = next;
}

export function getPlatformRuntime(): PlatformRuntimeConfig {
  if (!config) {
    throw new Error('Platform runtime 未初始化，请先调用 createServer');
  }
  return config;
}
