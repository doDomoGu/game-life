export const ROOM_PLAY_KEY = 'game-life-room-play';

export interface RoomPlayContext {
  code: string;
  complete: () => Promise<void>;
}
