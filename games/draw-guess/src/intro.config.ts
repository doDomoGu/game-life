import type { GameIntroConfig } from '@game-life/shared';

export const drawGuessIntro: GameIntroConfig = {
  rules: [
    '2～8 人。房主在房间里选择「你画我猜」并开始',
    '一局 10 轮，每轮 60 秒，边画边猜',
    '开始时随机排定画手顺序，之后按这个顺序循环',
    '猜词是一个输入框，旁边标明答案有几个字，整词写完再提交',
    '60 秒内可以有多人猜对。猜错会在头像旁显示错词和红叉，猜对显示绿色对勾',
    '猜对按剩余时间计 1～3 分。画手得分是猜对者得分之和；全部猜对时画手本轮 0 分',
    '每轮展示得分，5 秒后自动下一轮。第 10 轮后看每一轮明细和总分名次',
  ],
  bestRecordLabel: '最高总分',
  recordStyle: 'score',
  historyScoreHint: '每局记录总分',
};
