import type { GameIntroConfig } from '@game-life/shared';

export const colorGuessIntro: GameIntroConfig = {
  rules: [
    '单人游玩：系统随机出 4 位颜色密码，最多猜 10 次',
    '双人竞速：系统出题，两人轮流猜，总共最多 10 轮（每人 5 次），谁先猜中谁获胜；都没猜中则平局',
    '双人出题：一位玩家秘密设置 4 位颜色密码，另一位最多猜 10 次；猜中答题者胜，没猜中出题者胜',
    '每次猜 4 个颜色。先点格子再点色块填入；已填的格子可换色，再点同色或「清空此格」可擦掉这一格',
    '全对 = 颜色和位置都正确；半对 = 颜色正确但位置不对',
    '可配置 8 种或 10 种颜色；10 种更难',
    '「密码不重复」只约束密码本身不能出现相同颜色；猜测时始终可以重复填色，用来排除选项',
  ],
  bestRecordLabel: '获胜局数',
  recordStyle: 'match',
  historyScoreHint: '每局记录模式、猜测次数和胜负',
};
