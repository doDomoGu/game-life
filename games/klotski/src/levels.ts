import { clonePieces, type Piece } from './board.js';

export interface KlotskiLevel {
  id: 'easy' | 'normal' | 'hard';
  name: string;
  label: string;
  pieces: Piece[];
}

const CAO = (x: number, y: number): Piece => ({ id: 'cao', name: '曹操', kind: 'cao', w: 2, h: 2, x, y });
const GUAN = (x: number, y: number): Piece => ({ id: 'guan', name: '关羽', kind: 'general', w: 2, h: 1, x, y });
const TALL = (id: string, name: string, x: number, y: number): Piece => ({
  id,
  name,
  kind: 'general',
  w: 1,
  h: 2,
  x,
  y,
});
const SOLDIER = (id: string, x: number, y: number): Piece => ({ id, name: '兵', kind: 'soldier', w: 1, h: 1, x, y });

export const LEVELS: KlotskiLevel[] = [
  {
    id: 'easy',
    name: '近在咫尺',
    label: '简单',
    pieces: [
      CAO(0, 3),
      GUAN(2, 3),
      TALL('zhang', '张飞', 0, 0),
      TALL('zhao', '赵云', 2, 0),
      TALL('ma', '马超', 1, 1),
      TALL('huang', '黄忠', 3, 1),
      SOLDIER('s1', 0, 2),
      SOLDIER('s2', 2, 2),
      SOLDIER('s3', 2, 4),
      SOLDIER('s4', 3, 4),
    ],
  },
  {
    id: 'normal',
    name: '小试牛刀',
    label: '普通',
    pieces: [
      CAO(1, 2),
      GUAN(1, 4),
      TALL('zhang', '张飞', 0, 1),
      TALL('zhao', '赵云', 2, 0),
      TALL('ma', '马超', 1, 0),
      TALL('huang', '黄忠', 3, 1),
      SOLDIER('s1', 3, 4),
      SOLDIER('s2', 3, 3),
      SOLDIER('s3', 0, 3),
      SOLDIER('s4', 0, 4),
    ],
  },
  {
    id: 'hard',
    name: '横刀立马',
    label: '困难',
    pieces: [
      CAO(1, 0),
      GUAN(1, 2),
      TALL('zhang', '张飞', 0, 0),
      TALL('zhao', '赵云', 3, 0),
      TALL('ma', '马超', 0, 2),
      TALL('huang', '黄忠', 3, 2),
      SOLDIER('s1', 1, 3),
      SOLDIER('s2', 2, 3),
      SOLDIER('s3', 0, 4),
      SOLDIER('s4', 3, 4),
    ],
  },
];

export function levelById(id: string) {
  return LEVELS.find((level) => level.id === id) ?? null;
}

export function freshPieces(level: KlotskiLevel) {
  return clonePieces(level.pieces);
}
