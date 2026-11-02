import type { GameIntroConfig } from '@game-life/shared';

export const colorGuessIntro: GameIntroConfig = {
  rules: [
    '单人游玩：系统随机出 4 位颜色密码，最多猜 10 次',
    '双人竞速：系统出题，两人轮流猜，总共最多 10 轮（每人 5 次），谁先猜中谁获胜；都没猜中则平局',
    '双人出题：一位玩家秘密设置 4 位颜色密码，另一位最多猜 10 次；猜中答题者胜，没猜中出题者胜',
    '每次猜 4 个颜色，按位置比较后返回「全对」和「半对」数量',
    '全对 = 颜色和位置都正确；半对 = 颜色正确但位置不对',
    '可配置 8 种或 10 种颜色；10 种更难',
    '可配置是否允许重复颜色；允许重复时密码和猜测都可能出现重复',
  ],
  bestRecordLabel: '获胜局数',
  recordStyle: 'match',
  historyScoreHint: '每局记录模式、猜测次数和胜负',
};
