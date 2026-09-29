/** 游戏元数据（底座与 API 列表用，具体规则在各游戏包内） */
export interface GameMeta {
  id: string;
  name: string;
  description: string;
}

/** 由平台在启动时传入的 Fastify 实例（避免 shared 依赖 fastify 包） */
export type GameHttpApp = {
  get: (...args: unknown[]) => unknown;
  post: (...args: unknown[]) => unknown;
};

export interface ServerGamePlugin extends GameMeta {
  validateSubmit?(rawScore: number, durationMs?: number): string | null;
  registerHttp?: (app: GameHttpApp) => Promise<void>;
}

/** 游戏介绍页（平台模板）文案，由各游戏包配置 */
export interface GameIntroConfig {
  /** 玩法说明，每条一行 */
  rules: string[];
  /** 个人最佳 rawScore 的展示标签，如「最少翻开次数」 */
  bestRecordLabel: string;
  /** 对局历史页说明，缺省则用 bestRecordLabel */
  historyScoreHint?: string;
  /** 多人房间入口（如 Bingo） */
  roomLobbyRouteName?: string;
  roomLobbyLabel?: string;
}

export interface WebGameExtraRoute {
  path: string;
  name: string;
  load: () => Promise<unknown>;
}

/** 前端路由：介绍页（平台模板）→ 对局/房间；历史为 /game/:gameId/history */
export interface WebGamePlugin extends GameMeta {
  cover?: string;
  intro: GameIntroConfig;
  introRouteName: string;
  introRoutePath: string;
  /** 单机对局页；多人-only 游戏可省略 */
  playRouteName?: string;
  playRoutePath?: string;
  loadPlay?: () => Promise<unknown>;
  /** 游戏自定义页面（房间大厅等） */
  extraRoutes?: WebGameExtraRoute[];
}
