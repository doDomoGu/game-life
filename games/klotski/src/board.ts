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

export interface PieceMove {
  id: string;
  x: number;
  y: number;
}

function pieceAt(pieces: readonly Piece[], x: number, y: number): Piece | undefined {
  return pieces.find((piece) => x >= piece.x && x < piece.x + piece.w && y >= piece.y && y < piece.y + piece.h);
}

function canTranslate(pieces: readonly Piece[], group: ReadonlySet<string>, dx: number, dy: number): boolean {
  for (const piece of pieces) {
    if (!group.has(piece.id)) continue;
    const x = piece.x + dx;
    const y = piece.y + dy;
    if (!fits(piece, x, y)) return false;
    for (let row = y; row < y + piece.h; row += 1) {
      for (let col = x; col < x + piece.w; col += 1) {
        const occupier = pieceAt(pieces, col, row);
        if (occupier && !group.has(occupier.id)) return false;
      }
    }
  }
  return true;
}

function overlapsShift(pieces: readonly Piece[], group: ReadonlySet<string>, other: Piece, dx: number, dy: number): boolean {
  for (const piece of pieces) {
    if (!group.has(piece.id)) continue;
    const x = piece.x + dx;
    const y = piece.y + dy;
    if (x < other.x + other.w && x + piece.w > other.x && y < other.y + other.h && y + piece.h > other.y) return true;
  }
  return false;
}

/** 被拖的棋子，加上它在移动方向上依次顶着的棋子。并排在旁边的棋子不跟着走。 */
function moveGroup(pieces: readonly Piece[], id: string, dx: number, dy: number): Set<string> {
  const group = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const other of pieces) {
      if (group.has(other.id) || !overlapsShift(pieces, group, other, dx, dy)) continue;
      group.add(other.id);
      grew = true;
    }
  }
  if (!canTranslate(pieces, group, dx, dy)) return new Set([id]);
  return group;
}

function slideRoom(pieces: readonly Piece[], group: ReadonlySet<string>, dx: number, dy: number): number {
  const sim = clonePieces(pieces);
  const limit = dx !== 0 ? COLS : ROWS;
  let steps = 0;
  while (steps < limit && canTranslate(sim, group, dx, dy)) {
    for (const piece of sim) {
      if (!group.has(piece.id)) continue;
      piece.x += dx;
      piece.y += dy;
    }
    steps += 1;
  }
  return steps;
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

/** 一次拖动。前方被顶住的棋子还能让开时一起滑动；前方没有棋子时单独走，可以拐弯。 */
export function dragGroup(pieces: readonly Piece[], id: string, towardX: number, towardY: number): PieceMove[] {
  const piece = pieces.find((item) => item.id === id);
  if (!piece) return [];
  const dx = towardX - piece.x;
  const dy = towardY - piece.y;
  if (dx === 0 && dy === 0) return [];
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const dirX = horizontal ? Math.sign(dx) : 0;
  const dirY = horizontal ? 0 : Math.sign(dy);
  const steps = horizontal ? Math.abs(dx) : Math.abs(dy);
  const group = moveGroup(pieces, id, dirX, dirY);
  const room = slideRoom(pieces, group, dirX, dirY);
  if (group.size > 1 && room > 0) {
    const distance = Math.min(steps, room);
    return pieces
      .filter((item) => group.has(item.id))
      .map((item) => ({ id: item.id, x: item.x + dirX * distance, y: item.y + dirY * distance }));
  }
  const next = dragPiece(pieces, id, towardX, towardY);
  if (next.x === piece.x && next.y === piece.y) return [];
  return [{ id: piece.id, x: next.x, y: next.y }];
}

export function placePiece(pieces: readonly Piece[], id: string, x: number, y: number): Piece[] | null {
  const piece = pieces.find((item) => item.id === id);
  if (!piece || (piece.x === x && piece.y === y)) return null;
  if (!reachable(pieces, piece).some((spot) => spot.x === x && spot.y === y)) return null;
  return pieces.map((item) => (item.id === id ? { ...item, x, y } : item));
}

export function placeGroup(pieces: readonly Piece[], anchorId: string, moves: readonly PieceMove[]): Piece[] | null {
  const anchor = pieces.find((piece) => piece.id === anchorId);
  if (!anchor || moves.length === 0 || moves.some((move) => !pieces.some((piece) => piece.id === move.id))) return null;
  if (moves.length === 1 && moves[0]?.id === anchorId) return placePiece(pieces, anchorId, moves[0].x, moves[0].y);
  const deltas = moves.map((move) => {
    const piece = pieces.find((item) => item.id === move.id);
    return piece ? { dx: move.x - piece.x, dy: move.y - piece.y } : null;
  });
  if (deltas.some((delta) => !delta)) return null;
  const dx = deltas[0]?.dx ?? 0;
  const dy = deltas[0]?.dy ?? 0;
  if (deltas.some((delta) => delta?.dx !== dx || delta?.dy !== dy)) return null;
  if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) return null;
  const dirX = Math.sign(dx);
  const dirY = Math.sign(dy);
  const distance = Math.abs(dx + dy);
  const group = moveGroup(pieces, anchorId, dirX, dirY);
  if (group.size !== moves.length || moves.some((move) => !group.has(move.id))) return null;
  if (slideRoom(pieces, group, dirX, dirY) < distance) return null;
  return pieces.map((piece) => (group.has(piece.id) ? { ...piece, x: piece.x + dirX * distance, y: piece.y + dirY * distance } : piece));
}
