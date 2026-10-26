const FIXED_LABELS = ['', '单人游戏', '双人游戏', '三人游戏', '四人游戏', '五人游戏', '六人游戏', '七人游戏', '八人游戏'];

export function fixedPlayerLabel(count: number): string | null {
  if (!Number.isInteger(count) || count < 1 || count > FIXED_LABELS.length - 1) return null;
  return FIXED_LABELS[count] ?? null;
}

/** 人数只有一档时用「单人游戏」这类说法，否则保留区间。 */
export function gameCapacityLabel(minPlayers: number, maxPlayers: number): string {
  if (minPlayers === maxPlayers) return fixedPlayerLabel(minPlayers) ?? `${minPlayers} 人`;
  return `${minPlayers}–${maxPlayers} 人`;
}
