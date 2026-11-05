import type { HandFacts, WaitType, WinTileGroup } from './types.js';

function groupValueSuit(group: string) {
  const match = group.match(/^([1-9]+)([mpsz])$/);
  if (!match) return null;
  return { digits: match[1]!, suit: match[2]! };
}

function isTerminalOrHonor(value: number, suit: string) {
  return suit === 'z' || value === 1 || value === 9;
}

export function calcMentsuFu(group: string, isOpen: boolean, isKan: boolean): number {
  const parsed = groupValueSuit(group);
  if (!parsed) return 0;
  const value = Number(parsed.digits[0]);
  const terminalOrHonor = isTerminalOrHonor(value, parsed.suit);
  if (!isKan) return isOpen ? (terminalOrHonor ? 4 : 2) : terminalOrHonor ? 8 : 4;
  return isOpen ? (terminalOrHonor ? 16 : 8) : terminalOrHonor ? 32 : 16;
}

function waitFu(waitType: WaitType): number {
  if (waitType === '边张' || waitType === '坎张' || waitType === '单骑听牌') return 2;
  return 0;
}

function ceilToTen(fu: number) {
  return Math.ceil(fu / 10) * 10;
}

function tileToMeldCode(tiles: string[]): string {
  if (!tiles.length) return '';
  const suit = tiles[0]!.slice(-1);
  const digit = tiles[0]![0];
  return `${digit.repeat(tiles.length)}${suit}`;
}

export function calculateFu(question: HandFacts & { yaku: string[] }, winTiles: WinTileGroup[]): { fu: number; fuDetails: string[] } {
  const isPinfu = question.yaku.includes('平和');
  const isChiitoi = question.yaku.includes('七对子');
  const menzenTsumo = question.openMelds.length === 0 && question.winType === 'tsumo';

  if (isChiitoi) return { fu: 25, fuDetails: ['七对子固定 25 符'] };
  if (isPinfu) {
    const fu = menzenTsumo ? 20 : 30;
    return { fu, fuDetails: [menzenTsumo ? '平和自摸固定 20 符' : '平和荣和固定 30 符'] };
  }

  let fu = 20;
  const fuDetails = ['底符 20 符'];
  if (question.winType === 'ron' && question.openMelds.length === 0) {
    fu += 10;
    fuDetails.push('门清荣和 10 符');
  } else if (question.winType === 'tsumo') {
    fu += 2;
    fuDetails.push('自摸 2 符');
  }

  const pair = winTiles.find((item) => item.kind === 'pair');
  if (pair?.tiles[0]) {
    const tile = pair.tiles[0];
    const suit = tile.slice(-1);
    const value = Number(tile[0]);
    if (suit === 'z' && value >= 1 && value <= 7) {
      fu += 2;
      fuDetails.push('役牌雀头 2 符');
    }
  }

  for (const element of winTiles) {
    if (element.kind !== 'mentsu' || (element.subtype !== 'triplet' && element.subtype !== 'kan')) continue;
    const meldCode = tileToMeldCode(element.tiles);
    const isKan = element.subtype === 'kan';
    const add = calcMentsuFu(meldCode, Boolean(element.open), isKan);
    if (!add) continue;
    fu += add;
    fuDetails.push(isKan ? `杠 ${add} 符` : `刻子 ${add} 符`);
  }

  const extraWait = waitFu(question.waitType);
  if (extraWait) {
    fu += extraWait;
    fuDetails.push(`${question.waitType} ${extraWait} 符`);
  }

  return { fu: ceilToTen(fu), fuDetails };
}
