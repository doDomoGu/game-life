import type { GameIntroConfig } from '@game-life/shared';

export const bingoIntro: GameIntroConfig = {
  rules: [
    '支持 1～8 人在同一房间对战',
    '房主创建房间，其他玩家输入房间号加入',
    '5×5 共 25 格，对应 25 种不同图案，开局每人随机一张板',
    '每轮随机揭晓一种图案；格上有该图案则点亮',
    '横、竖、斜任意一线 5 格全亮即获胜',
  ],
  bestRecordLabel: '获胜局数',
  historyScoreHint: '单机成绩记录（房间对战暂不写入）',
  roomLobbyRouteName: 'bingo-room-lobby',
  roomLobbyLabel: '创建 / 加入房间',
};
