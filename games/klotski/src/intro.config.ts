import type { GameIntroConfig } from '@game-life/shared';

export const klotskiIntro: GameIntroConfig = {
  rules: [
    '单人游戏。房主在房间里选择「华容道」并开始',
    '开始后从十道经典布局里选一题。每题的曹操都在棋盘上方正中',
    '每颗棋子每移动一格算一步。拐弯时横着、竖着分开计；一起移动的棋子也分别计',
    '把曹操移到底边正中的出口即过关',
    '每题都标着最少步数。可以撤销和重来。过关后点「重开一局」回到选题。记录步数，越少越好',
    '点「演示」从开局按最少步数自动解题，每走一格停一秒。演示不计成绩',
  ],
  bestRecordLabel: '最少步数',
  historyScoreHint: '步数越少越好',
};
