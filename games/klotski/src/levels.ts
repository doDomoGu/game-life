import { clonePieces, type Piece, type PieceKind } from './board.js';

export interface KlotskiLevel {
  id: string;
  name: string;
  pieces: Piece[];
}

/** [高, 宽, 行, 列]，行从 0 起。第一块必须是曹操，且位于第 0 行第 1 列。 */
type Block = [number, number, number, number];

const VERTICAL = ['张飞', '赵云', '马超', '黄忠'];
const HORIZONTAL = ['关羽', '黄忠', '马超'];

function build(id: string, name: string, blocks: Block[]): KlotskiLevel {
  let vertical = 0;
  let horizontal = 0;
  let soldier = 0;
  const pieces: Piece[] = blocks.map(([h, w, y, x], index) => {
    if (index === 0) return piece('cao', '曹操', 'cao', w, h, x, y);
    if (w === 2 && h === 1) {
      const order = horizontal++;
      return piece(`h${order}`, HORIZONTAL[order] ?? '关羽', 'general', w, h, x, y);
    }
    if (w === 1 && h === 2) {
      const order = vertical++;
      return piece(`v${order}`, VERTICAL[order] ?? '张飞', 'general', w, h, x, y);
    }
    const order = soldier++;
    return piece(`s${order}`, '兵', 'soldier', w, h, x, y);
  });
  return { id, name, pieces };
}

function piece(id: string, name: string, kind: PieceKind, w: number, h: number, x: number, y: number): Piece {
  return { id, name, kind, w, h, x, y };
}

/** 十道经典布局，曹操都在顶上正中。坐标来自公开的华容道布局表。 */
export const LEVELS: KlotskiLevel[] = [
  build('jiezu', '捷足先登', [
    [2, 2, 0, 1],
    [2, 1, 3, 0],
    [2, 1, 3, 1],
    [2, 1, 3, 2],
    [2, 1, 3, 3],
    [1, 2, 2, 1],
    [1, 1, 0, 0],
    [1, 1, 0, 3],
    [1, 1, 1, 0],
    [1, 1, 1, 3],
  ]),
  build('bingfen', '兵分三路', [
    [2, 2, 0, 1],
    [2, 1, 1, 0],
    [2, 1, 1, 3],
    [2, 1, 3, 0],
    [2, 1, 3, 3],
    [1, 2, 2, 1],
    [1, 1, 0, 0],
    [1, 1, 0, 3],
    [1, 1, 3, 1],
    [1, 1, 3, 2],
  ]),
  build('yilu', '一路顺风', [
    [2, 2, 0, 1],
    [2, 1, 0, 0],
    [2, 1, 2, 0],
    [2, 1, 2, 3],
    [2, 1, 3, 2],
    [1, 2, 2, 1],
    [1, 1, 0, 3],
    [1, 1, 1, 3],
    [1, 1, 3, 1],
    [1, 1, 4, 1],
  ]),
  build('yusheng', '雨声淅沥', [
    [2, 2, 0, 1],
    [2, 1, 0, 0],
    [2, 1, 2, 0],
    [2, 1, 2, 3],
    [2, 1, 3, 1],
    [1, 2, 2, 1],
    [1, 1, 0, 3],
    [1, 1, 1, 3],
    [1, 1, 4, 0],
    [1, 1, 4, 3],
  ]),
  build('zuoyou', '左右布兵', [
    [2, 2, 0, 1],
    [2, 1, 2, 0],
    [2, 1, 2, 1],
    [2, 1, 2, 2],
    [2, 1, 2, 3],
    [1, 2, 4, 1],
    [1, 1, 0, 0],
    [1, 1, 0, 3],
    [1, 1, 1, 0],
    [1, 1, 1, 3],
  ]),
  build('qitou', '齐头并进', [
    [2, 2, 0, 1],
    [2, 1, 0, 0],
    [2, 1, 0, 3],
    [2, 1, 3, 0],
    [2, 1, 3, 3],
    [1, 2, 3, 1],
    [1, 1, 2, 0],
    [1, 1, 2, 1],
    [1, 1, 2, 2],
    [1, 1, 2, 3],
  ]),
  build('zhihui', '指挥若定', [
    [2, 2, 0, 1],
    [2, 1, 0, 0],
    [2, 1, 0, 3],
    [2, 1, 3, 0],
    [2, 1, 3, 3],
    [1, 2, 2, 1],
    [1, 1, 2, 0],
    [1, 1, 2, 3],
    [1, 1, 3, 1],
    [1, 1, 3, 2],
  ]),
  build('jiangyong', '将拥曹营', [
    [2, 2, 0, 1],
    [2, 1, 1, 0],
    [2, 1, 1, 3],
    [2, 1, 2, 1],
    [2, 1, 2, 2],
    [1, 2, 4, 0],
    [1, 1, 3, 0],
    [1, 1, 3, 3],
    [1, 1, 4, 2],
    [1, 1, 4, 3],
  ]),
  build('hengdao', '横刀立马', [
    [2, 2, 0, 1],
    [2, 1, 0, 0],
    [2, 1, 0, 3],
    [2, 1, 2, 0],
    [2, 1, 2, 3],
    [1, 2, 2, 1],
    [1, 1, 3, 1],
    [1, 1, 3, 2],
    [1, 1, 4, 0],
    [1, 1, 4, 3],
  ]),
  build('cengceng', '层层设防', [
    [2, 2, 0, 1],
    [2, 1, 0, 0],
    [2, 1, 0, 3],
    [1, 2, 2, 1],
    [1, 2, 3, 1],
    [1, 2, 4, 1],
    [1, 1, 2, 0],
    [1, 1, 2, 3],
    [1, 1, 3, 0],
    [1, 1, 3, 3],
  ]),
];

export function levelById(id: string) {
  return LEVELS.find((level) => level.id === id) ?? null;
}

export function freshPieces(level: KlotskiLevel) {
  return clonePieces(level.pieces);
}
