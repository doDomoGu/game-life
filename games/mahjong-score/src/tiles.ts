const SUIT_FILES: Record<string, string> = { m: 'Man', p: 'Pin', s: 'Sou' };
const HONOR_FILES: Record<string, string> = {
  '1': 'Ton',
  '2': 'Nan',
  '3': 'Shaa',
  '4': 'Pei',
  '5': 'Haku',
  '6': 'Hatsu',
  '7': 'Chun',
};

export const HONOR_NAMES: Record<string, string> = {
  '1': '东',
  '2': '南',
  '3': '西',
  '4': '北',
  '5': '白',
  '6': '发',
  '7': '中',
};

const SUIT_NAMES: Record<string, string> = { m: '万', p: '筒', s: '条' };

export function tileImageName(tile: string, red = false): string {
  const match = tile.match(/^([1-9])([mpsz])$/);
  if (!match) return 'Back';
  const [, value, suit] = match;
  if (suit === 'z') return HONOR_FILES[value] ?? 'Back';
  if (value === '5' && red) return `${SUIT_FILES[suit]}5-Dora`;
  return `${SUIT_FILES[suit]}${value}`;
}

export function tileLabel(tile: string): string {
  const match = tile.match(/^([1-9])([mpsz])$/);
  if (!match) return tile;
  const [, value, suit] = match;
  if (suit === 'z') return HONOR_NAMES[value] ?? tile;
  return `${value}${SUIT_NAMES[suit]}`;
}

export function expandGroup(group: string): string[] {
  const match = group.match(/^([1-9]+)([mpsz])$/);
  if (!match) return [];
  const [, digits, suit] = match;
  return [...digits].map((digit) => `${digit}${suit}`);
}

export function tileGroupsToHand13(groups: string[], pair: string): string[] {
  return [...groups.flatMap(expandGroup), ...expandGroup(pair)];
}

export function nextDoraTile(indicator: string): string {
  const match = indicator.match(/^([1-9])([mpsz])$/);
  if (!match) return indicator;
  const value = Number(match[1]);
  const suit = match[2];
  if (suit !== 'z') return `${value === 9 ? 1 : value + 1}${suit}`;
  if (value <= 4) return `${value === 4 ? 1 : value + 1}z`;
  return `${value >= 7 ? 5 : value + 1}z`;
}

export function countTile(groups: string[], tile: string): number {
  const match = tile.match(/^([1-9])([mpsz])$/);
  if (!match) return 0;
  const token = match[1];
  const suit = match[2];
  return groups.reduce((total, group) => {
    const groupMatch = group.match(/^([1-9]+)([mpsz])$/);
    if (!groupMatch || groupMatch[2] !== suit) return total;
    return total + [...groupMatch[1]].filter((value) => value === token).length;
  }, 0);
}

export const TILE_FILE_NAMES = [
  'Back',
  'Man1', 'Man2', 'Man3', 'Man4', 'Man5', 'Man5-Dora', 'Man6', 'Man7', 'Man8', 'Man9',
  'Pin1', 'Pin2', 'Pin3', 'Pin4', 'Pin5', 'Pin5-Dora', 'Pin6', 'Pin7', 'Pin8', 'Pin9',
  'Sou1', 'Sou2', 'Sou3', 'Sou4', 'Sou5', 'Sou5-Dora', 'Sou6', 'Sou7', 'Sou8', 'Sou9',
  'Ton', 'Nan', 'Shaa', 'Pei', 'Haku', 'Hatsu', 'Chun',
] as const;
