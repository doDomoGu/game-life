export const ROOM_PLAY_KEY = 'game-life-room-play';

export interface RoomPlayContext {
  code: string;
  complete: () => Promise<void>;
  /** 对局结束后回到房间等待页，全房间一起回去 */
  exit: () => Promise<void>;
}
