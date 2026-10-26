export const COLS = 4;
export const ROWS = 5;
/** 曹操左上角落到这里即过关，占据底部正中 2×2 */
export const EXIT = { x: 1, y: 3 } as const;

export type PieceKind = 'cao' | 'general' | 'soldier';

export interface Piece {
  id: string;
  name: string;
  kind: PieceKind;
  w: number;
  h: number;
  x: number;
  y: number;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function clonePieces(pieces: readonly Piece[]): Piece[] {
  return pieces.map((piece) => ({ ...piece }));
}

export function isWin(pieces: readonly Piece[]): boolean {
  const cao = pieces.find((piece) => piece.kind === 'cao');
  return cao?.x === EXIT.x && cao?.y === EXIT.y;
}

export function stateKey(pieces: readonly Piece[]): string {
  return pieces
    .map((piece) => `${piece.id}:${piece.x},${piece.y}`)
    .sort()
    .join('|');
}

function fits(piece: Pick<Piece, 'w' | 'h'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x + piece.w <= COLS && y + piece.h <= ROWS;
}

function blocked(pieces: readonly Piece[], self: Piece, x: number, y: number): boolean {
  if (!fits(self, x, y)) return true;
  return pieces.some((other) => {
    if (other.id === self.id) return false;
    return x < other.x + other.w && x + self.w > other.x && y < other.y + other.h && y + self.h > other.y;
  });
}

/** 一次按住期间，这块棋子沿空位滑到的所有位置。可以拐弯，松开才算一步。 */
export function reachable(pieces: readonly Piece[], piece: Piece): Array<{ x: number; y: number }> {
  const targets: Array<{ x: number; y: number }> = [];
  const seen = new Set([`${piece.x},${piece.y}`]);
  const queue = [{ x: piece.x, y: piece.y }];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    for (const [dx, dy] of DIRS) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = `${x},${y}`;
      if (seen.has(key) || blocked(pieces, piece, x, y)) continue;
      seen.add(key);
      queue.push({ x, y });
      targets.push({ x, y });
    }
  }
  return targets;
}

/** 按住拖动时，棋子朝手指方向沿能走的格子逐格靠拢。 */
export function dragPiece(pieces: readonly Piece[], id: string, towardX: number, towardY: number): { x: number; y: number } {
  const piece = pieces.find((item) => item.id === id);
  if (!piece) return { x: towardX, y: towardY };
  const spots = reachable(pieces, piece);
  let cursor = { x: piece.x, y: piece.y };
  for (let step = 0; step < COLS + ROWS; step += 1) {
    if (cursor.x === towardX && cursor.y === towardY) break;
    const dx = Math.sign(towardX - cursor.x);
    const dy = Math.sign(towardY - cursor.y);
    const preferX = Math.abs(towardX - cursor.x) >= Math.abs(towardY - cursor.y);
    const options = preferX
      ? [
          { x: cursor.x + dx, y: cursor.y },
          { x: cursor.x, y: cursor.y + dy },
        ]
      : [
          { x: cursor.x, y: cursor.y + dy },
          { x: cursor.x + dx, y: cursor.y },
        ];
    const next = options.find(
      (option) => option.x !== cursor.x || option.y !== cursor.y
        ? spots.some((spot) => spot.x === option.x && spot.y === option.y)
        : false,
    );
    if (!next) break;
    cursor = next;
  }
  return cursor;
}

export function placePiece(pieces: readonly Piece[], id: string, x: number, y: number): Piece[] | null {
  const piece = pieces.find((item) => item.id === id);
  if (!piece || (piece.x === x && piece.y === y)) return null;
  if (!reachable(pieces, piece).some((spot) => spot.x === x && spot.y === y)) return null;
  return pieces.map((item) => (item.id === id ? { ...item, x, y } : item));
}
