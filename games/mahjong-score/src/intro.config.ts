import type { GameIntroConfig } from '@game-life/shared';

export const mahjongScoreIntro: GameIntroConfig = {
  rules: [
    '单人游戏。房主在房间里选择「立直麻将 · 点数练习」并开始',
    '开始前选做 1 题、5 题或 10 题',
    '每题先填符数和番数，再填实际应支付的点数',
    '荣和填点炮者支付；亲家自摸填三家各付；子家自摸填子家和庄家各付',
    '全部做完后按答对题数记成绩，越多越好',
  ],
  bestRecordLabel: '最多答对',
  recordStyle: 'score',
  historyScoreHint: '一次练习的答对题数',
};
