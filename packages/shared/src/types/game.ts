/** 游戏元数据（底座与 API 列表用，具体规则在各游戏包内） */
export interface GameMeta {
  id: string;
  name: string;
  description: string;
}

export interface ServerGamePlugin extends GameMeta {
  validateSubmit(rawScore: number, durationMs?: number): string | null;
}

/** 前端路由用；loadPlay 由各游戏包返回 Vue 组件模块 */
export interface WebGamePlugin extends GameMeta {
  routeName: string;
  routePath: string;
  loadPlay: () => Promise<unknown>;
}
