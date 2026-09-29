import type { GameMeta, ServerGamePlugin } from '@game-life/shared';

export type { ServerGamePlugin };

let plugins: ServerGamePlugin[] = [];

export function registerServerGames(gamePlugins: ServerGamePlugin[]) {
  plugins = gamePlugins;
}

export function listGames(): GameMeta[] {
  return plugins.map(({ id, name, description }) => ({ id, name, description }));
}

export function getGame(id: string): GameMeta | undefined {
  return plugins.find((g) => g.id === id);
}

export function validateSubmit(
  gameId: string,
  rawScore: number,
  durationMs?: number,
): string | null {
  const game = plugins.find((g) => g.id === gameId);
  if (!game) {
    return '未知游戏';
  }
  if (!game.validateSubmit) {
    return '该游戏不支持提交单局成绩';
  }
  return game.validateSubmit(rawScore, durationMs);
}

export function getServerGamePlugins(): ServerGamePlugin[] {
  return plugins;
}

export function getDefaultGameId(): string | undefined {
  return plugins[0]?.id;
}
