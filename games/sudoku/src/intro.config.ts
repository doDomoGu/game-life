import type { GameIntroConfig } from '@game-life/shared';

export const sudokuIntro: GameIntroConfig = {
  rules: [
    '单人游戏。房主在房间里选择「数独」并开始',
    '固定题库：简单、普通、困难各 30 题，进入难度后可任选一题，也可以重玩已通关的题',
    '把 1～9 填进 9×9 格子，每行、每列、每个 3×3 宫都恰好出现一次',
    '某个数字已经出现 9 次后，键盘上就不能再填这个数字',
    '点「草稿」后，空格可以记下多个候选数字；真正填入后草稿会清掉',
    '灰字是题目给定的数字，不能改',
    '计时只在游戏页面可见时累计；离开或刷新页面视为放弃本局',
    '完成后记录该题最短用时，账号中心和首页可以查看每个难度的完成进度与用时',
  ],
  bestRecordLabel: '单题最短用时',
  recordStyle: 'time',
  historyScoreHint: '每题记录最短用时',
};
