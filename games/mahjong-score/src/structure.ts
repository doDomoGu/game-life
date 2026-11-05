import { expandGroup, tileGroupsToHand13 } from './tiles.js';
import type { HandFacts, WinTileGroup } from './types.js';

function parseMeld(meldStr: string, open: boolean): WinTileGroup | null {
  if (/^[1-9]{3}[mps]$/.test(meldStr)) {
    const match = meldStr.match(/^([1-9])([1-9])([1-9])([mps])$/);
    if (!match) return null;
    return {
      kind: 'mentsu',
      subtype: 'shun',
      open,
      tiles: [`${match[1]}${match[4]}`, `${match[2]}${match[4]}`, `${match[3]}${match[4]}`],
    };
  }
  if (/^([1-9])\1\1[mpsz]$/.test(meldStr)) {
    const match = meldStr.match(/^([1-9])\1\1([mpsz])$/);
    if (!match) return null;
    const tile = `${match[1]}${match[2]}`;
    return { kind: 'mentsu', subtype: 'triplet', open, tiles: [tile, tile, tile] };
  }
  if (/^([1-9])\1\1\1[mpsz]$/.test(meldStr)) {
    const match = meldStr.match(/^([1-9])\1\1\1([mpsz])$/);
    if (!match) return null;
    const tile = `${match[1]}${match[2]}`;
    return { kind: 'mentsu', subtype: 'kan', open, tiles: [tile, tile, tile, tile] };
  }
  return null;
}

export function buildWinTiles(facts: Pick<HandFacts, 'groups' | 'openMelds' | 'concealedKans' | 'pair'>): WinTileGroup[] {
  const elements: WinTileGroup[] = [];
  for (const group of facts.groups) {
    const parsed = parseMeld(group, false);
    if (parsed) elements.push(parsed);
  }
  for (const meld of facts.openMelds) {
    const parsed = parseMeld(meld, true);
    if (parsed) elements.push(parsed);
  }
  for (const kan of facts.concealedKans) {
    const parsed = parseMeld(kan, false);
    if (parsed) elements.push(parsed);
  }
  const pairMatch = facts.pair.match(/^([1-9])\1([mpsz])$/);
  if (pairMatch) {
    const tile = `${pairMatch[1]}${pairMatch[2]}`;
    elements.push({ kind: 'pair', subtype: null, tiles: [tile, tile] });
  }
  return elements;
}

export function collectHandTiles(winTiles: WinTileGroup[]): string[] {
  const tiles: string[] = [];
  for (const element of winTiles) {
    if (element.kind === 'pair') {
      tiles.push(...element.tiles);
      continue;
    }
    if (element.open || element.subtype === 'kan') continue;
    tiles.push(...element.tiles);
  }
  return tiles;
}

export function pickWinTile(winTiles: WinTileGroup[]): string | null {
  const tiles = collectHandTiles(winTiles);
  if (!tiles.length) return null;
  return tiles[Math.floor(Math.random() * tiles.length)] ?? null;
}

export function validateHand(facts: HandFacts, winTiles: WinTileGroup[]): boolean {
  const counts = new Map<string, number>();
  for (const element of winTiles) {
    for (const tile of element.tiles) counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  for (const count of counts.values()) {
    if (count > 4) return false;
  }
  return winTiles.some((element) => element.tiles.includes(facts.winTile));
}

export function allTilesFromFacts(facts: HandFacts): string[] {
  return [
    ...facts.groups,
    ...facts.openMelds,
    ...facts.concealedKans,
    facts.pair,
    facts.winTile,
  ].flatMap(expandGroup);
}

export function closedHand(groups: string[], pair: string): string[] {
  return tileGroupsToHand13(groups, pair);
}
