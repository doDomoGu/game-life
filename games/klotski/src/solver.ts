import { COLS, EXIT, ROWS, type Piece } from './board.js';

export interface SolveStep {
  id: string;
  dx: number;
  dy: number;
}

const DIRS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const;

function shapeCode(piece: Pick<Piece, 'kind' | 'w' | 'h'>): string {
  if (piece.kind === 'cao') return 'C';
  if (piece.w === 2) return 'H';
  if (piece.h === 2) return 'V';
  return 'S';
}

/** 同形状的棋子视为相同，局面只看每格是什么形状。 */
function boardKey(pieces: readonly Piece[], xs: Int8Array, ys: Int8Array, codes: readonly string[]): string {
  const cells = new Array<string>(COLS * ROWS).fill('.');
  pieces.forEach((piece, index) => {
    for (let dy = 0; dy < piece.h; dy += 1) {
      for (let dx = 0; dx < piece.w; dx += 1) {
        cells[(ys[index]! + dy) * COLS + xs[index]! + dx] = codes[index]!;
      }
    }
  });
  return cells.join('');
}

/**
 * 按「每颗棋子每走一格算一步」求最短解。
 * 一起推动、拐弯都能拆成单子单格移动，代价相同，所以单格广度优先搜索得到的就是最少步数。
 */
export function solve(pieces: readonly Piece[]): SolveStep[] | null {
  const count = pieces.length;
  const codes = pieces.map(shapeCode);
  const caoIndex = pieces.findIndex((piece) => piece.kind === 'cao');
  if (caoIndex < 0) return null;

  const startX = Int8Array.from(pieces.map((piece) => piece.x));
  const startY = Int8Array.from(pieces.map((piece) => piece.y));
  const statesX: Int8Array[] = [startX];
  const statesY: Int8Array[] = [startY];
  const parent: number[] = [-1];
  const via: number[] = [-1];
  const seen = new Set([boardKey(pieces, startX, startY, codes)]);
  const occupied = new Uint8Array(COLS * ROWS);

  for (let head = 0; head < statesX.length; head += 1) {
    const xs = statesX[head]!;
    const ys = statesY[head]!;
    if (xs[caoIndex] === EXIT.x && ys[caoIndex] === EXIT.y) return unwind(head, parent, via, pieces);

    occupied.fill(0);
    for (let index = 0; index < count; index += 1) {
      const piece = pieces[index]!;
      for (let dy = 0; dy < piece.h; dy += 1) {
        for (let dx = 0; dx < piece.w; dx += 1) occupied[(ys[index]! + dy) * COLS + xs[index]! + dx] = 1;
      }
    }

    for (let index = 0; index < count; index += 1) {
      const piece = pieces[index]!;
      for (let dir = 0; dir < DIRS.length; dir += 1) {
        const [mx, my] = DIRS[dir]!;
        const nx = xs[index]! + mx;
        const ny = ys[index]! + my;
        if (nx < 0 || ny < 0 || nx + piece.w > COLS || ny + piece.h > ROWS) continue;
        let free = true;
        for (let dy = 0; dy < piece.h && free; dy += 1) {
          for (let dx = 0; dx < piece.w; dx += 1) {
            const cx = nx + dx;
            const cy = ny + dy;
            const own = cx >= xs[index]! && cx < xs[index]! + piece.w && cy >= ys[index]! && cy < ys[index]! + piece.h;
            if (!own && occupied[cy * COLS + cx]) {
              free = false;
              break;
            }
          }
        }
        if (!free) continue;
        const nextX = xs.slice();
        const nextY = ys.slice();
        nextX[index] = nx;
        nextY[index] = ny;
        const key = boardKey(pieces, nextX, nextY, codes);
        if (seen.has(key)) continue;
        seen.add(key);
        statesX.push(nextX);
        statesY.push(nextY);
        parent.push(head);
        via.push(index * DIRS.length + dir);
      }
    }
  }
  return null;
}

function unwind(node: number, parent: number[], via: number[], pieces: readonly Piece[]): SolveStep[] {
  const steps: SolveStep[] = [];
  for (let cursor = node; parent[cursor]! >= 0; cursor = parent[cursor]!) {
    const code = via[cursor]!;
    const [dx, dy] = DIRS[code % DIRS.length]!;
    steps.push({ id: pieces[Math.floor(code / DIRS.length)]!.id, dx, dy });
  }
  return steps.reverse();
}
