import type { GameIntroConfig } from '@game-life/shared';

export const pokerMemoryIntro: GameIntroConfig = {
  rules: [
    '16 张牌，8 对（A～7，♠ / ♥ 同点数配对）',
    '点击翻牌，两张相同点数即配对成功',
    '每翻开 2 张计 1 次，全部配完记录总次数',
    '次数越少越好（理论最少 8 次）',
  ],
  bestRecordLabel: '最少翻开次数',
  historyScoreHint: '翻开次数越少越好',
};
