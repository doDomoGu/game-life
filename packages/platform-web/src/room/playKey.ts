export const ROOM_PLAY_KEY = 'game-life-room-play';

export interface RoomPlayContext {
  code: string;
  /** 单人游戏把本局结果写完；多人对局由游戏服务端结算 */
  complete: () => Promise<void>;
}
