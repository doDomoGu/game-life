import type { Graphics } from 'pixi.js';
import type { Piece } from '../../board.js';

export interface PixelLook {
  robe: number;
  robeLight: number;
  trim: number;
  face: number;
  hair: number;
  beard: 'long' | 'wide' | 'short' | 'white' | 'none';
  hat: 'crown' | 'helmet' | 'cap' | 'plume';
}

const GRID = 14;
const OUTLINE = 0x1a120c;
const EYE = 0x1c140c;

/**
 * 在棋子漆面上画一个 14×14 的像素人物半身像。
 * 所有图形都对齐到整数像素块，缩放后保持硬边。
 */
export function paintPixelPortrait(
  g: Graphics,
  piece: Piece,
  look: PixelLook,
  width: number,
  height: number,
) {
  const available = Math.max(20, height - 28);
  const unit = Math.max(2, Math.floor(Math.min(width * 0.7, available * 0.86) / GRID));
  const portrait = unit * GRID;
  const originX = Math.round((width - portrait) / 2);
  const originY = Math.round(5 + (available - portrait) / 2);

  const px = (x: number, y: number, w: number, h: number, color: number) => {
    g.rect(originX + x * unit, originY + y * unit, w * unit, h * unit).fill(color);
  };

  // 袍身：阶梯状肩线，像素画不需要圆角
  px(2, 10, 10, 4, look.robe);
  px(3, 9, 8, 1, look.robe);
  px(1, 11, 2, 3, look.robeLight);
  px(11, 11, 2, 3, look.robeLight);
  px(4, 13, 2, 1, look.robe);
  px(8, 13, 2, 1, look.robe);
  px(3, 10, 8, 1, look.trim);
  px(6, 11, 2, 3, look.robeLight);
  px(6, 11, 1, 3, look.trim);

  // 头发边缘与脸
  px(4, 3, 6, 1, look.hair);
  px(3, 4, 1, 4, look.hair);
  px(10, 4, 1, 4, look.hair);
  px(4, 4, 6, 5, look.face);
  px(4, 8, 6, 1, look.face);
  px(5, 6, 1, 1, look.face);
  px(8, 6, 1, 1, look.face);
  px(6, 7, 2, 1, look.face);

  // 一条深色像素边，增强老式像素画的轮廓
  px(2, 9, 10, 1, OUTLINE);
  px(2, 10, 1, 4, OUTLINE);
  px(11, 10, 1, 4, OUTLINE);
  px(3, 4, 1, 4, OUTLINE);
  px(10, 4, 1, 4, OUTLINE);

  paintHat(px, look);
  paintBeard(px, look);

  // 眼睛最后画，确保不被帽子、胡子或轮廓遮住
  px(5, 5, 1, 1, EYE);
  px(8, 5, 1, 1, EYE);

  // 士兵尺寸很小，额外保留一个肩甲高光
  if (piece.kind === 'soldier') {
    px(3, 10, 2, 1, look.trim);
    px(9, 10, 2, 1, look.trim);
  }
}

function paintHat(
  px: (x: number, y: number, w: number, h: number, color: number) => void,
  look: PixelLook,
) {
  if (look.hat === 'crown') {
    px(4, 0, 1, 1, look.trim);
    px(6, 0, 2, 1, look.trim);
    px(9, 0, 1, 1, look.trim);
    px(4, 1, 6, 1, look.trim);
    px(4, 2, 6, 1, OUTLINE);
    px(5, 2, 4, 1, look.trim);
    return;
  }
  if (look.hat === 'plume') {
    px(7, 0, 1, 2, 0xf7f4ea);
    px(8, 1, 1, 1, 0xf7f4ea);
    px(4, 2, 6, 1, 0x243044);
    px(4, 3, 6, 1, 0x243044);
    px(4, 4, 6, 1, look.trim);
    return;
  }
  if (look.hat === 'cap') {
    px(4, 1, 6, 2, look.hair);
    px(3, 2, 8, 1, look.hair);
    px(3, 3, 8, 1, look.trim);
    return;
  }
  px(4, 1, 6, 2, 0x3a332c);
  px(3, 2, 8, 1, 0x3a332c);
  px(3, 3, 2, 2, 0x3a332c);
  px(9, 3, 2, 2, 0x3a332c);
  px(4, 3, 6, 1, look.trim);
}

function paintBeard(
  px: (x: number, y: number, w: number, h: number, color: number) => void,
  look: PixelLook,
) {
  if (look.beard === 'none') return;
  const color = look.beard === 'white' ? 0xe7e2d8 : look.hair;
  if (look.beard === 'long') {
    px(6, 8, 2, 1, color);
    px(5, 9, 4, 1, color);
    px(5, 10, 4, 1, color);
    px(6, 11, 2, 2, color);
    return;
  }
  if (look.beard === 'wide') {
    px(4, 8, 6, 1, color);
    px(5, 9, 4, 1, color);
    return;
  }
  px(5, 8, 4, 1, color);
  px(6, 9, 2, 1, color);
}
