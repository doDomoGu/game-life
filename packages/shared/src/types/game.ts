/** 游戏元数据（底座与 API 列表用，具体规则在各游戏包内） */
export interface GameMeta {
  id: string;
  name: string;
  description: string;
}

export interface ServerGamePlugin extends GameMeta {
  validateSubmit(rawScore: number, durationMs?: number): string | null;
}

/** 游戏介绍页（平台模板）文案，由各游戏包配置 */
export interface GameIntroConfig {
  /** 玩法说明，每条一行 */
  rules: string[];
  /** 个人最佳 rawScore 的展示标签，如「最少翻开次数」 */
  bestRecordLabel: string;
  /** 对局历史页说明，缺省则用 bestRecordLabel */
  historyScoreHint?: string;
}

/** 前端路由：介绍页（平台模板）→ 对局页；历史为 /game/:gameId/history */
export interface WebGamePlugin extends GameMeta {
  cover?: string;
  intro: GameIntroConfig;
  introRouteName: string;
  introRoutePath: string;
  playRouteName: string;
  playRoutePath: string;
  loadPlay: () => Promise<unknown>;
}
