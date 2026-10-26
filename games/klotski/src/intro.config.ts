import type { GameIntroConfig } from '@game-life/shared';

export const klotskiIntro: GameIntroConfig = {
  rules: [
    '单人游戏。房主在房间里选择「华容道」并开始',
    '开始后选择布局：近在咫尺、小试牛刀、横刀立马',
    '拖动棋子沿空位滑动，一次按住可以拐弯，松手算一步',
    '把曹操移到底边正中的出口即过关',
    '可以撤销和重来。记录步数，越少越好',
  ],
  bestRecordLabel: '最少步数',
  historyScoreHint: '步数越少越好',
};
