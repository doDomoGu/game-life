import type { GameIntroConfig } from '@game-life/shared';

export const hanabiIntro: GameIntroConfig = {
  rules: [
    '2～5 人合作：房主建房间、选「花火牌 HANABI」并开始，其他人用房间号加入',
    '每人看不到自己的手牌，只能看到队友的牌；提示会标记在牌角',
    '每回合三选一：提示队友（消耗 1 枚提示令牌）、弃牌（回复 1 枚提示）、出牌',
    '出牌必须接上该颜色当前最高数字 +1，接错消耗 1 次失误，3 次失误立即失败',
    '五色都打到 5 即满分胜利；牌库抽空后每人再行动一轮，按五色高度计分（满分 25）',
    '当前回合玩家断线时，全桌等待其重连，不代打、不跳过',
  ],
  bestRecordLabel: '最高分（满分 25）',
  recordStyle: 'score',
  historyScoreHint: '每局记录合作得分',
};
