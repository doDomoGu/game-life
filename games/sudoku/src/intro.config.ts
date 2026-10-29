import type { GameIntroConfig } from '@game-life/shared';

export const sudokuIntro: GameIntroConfig = {
  rules: [
    '单人游戏。房主在房间里选择「数独」并开始',
    '开始后选择难度：简单、普通、困难',
    '把 1～9 填进 9×9 格子，每行、每列、每个 3×3 宫都恰好出现一次',
    '某个数字已经出现 9 次后，键盘上就不能再填这个数字',
    '点「草稿」后，空格可以记下多个候选数字；真正填入后草稿会清掉',
    '灰字是题目给定的数字，不能改',
    '填完且没有冲突即完成，记录用时，越短越好',
  ],
  bestRecordLabel: '最短用时',
  recordStyle: 'time',
  historyScoreHint: '用时越短越好',
};
