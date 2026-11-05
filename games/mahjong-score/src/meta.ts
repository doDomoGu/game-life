export const MAHJONG_SCORE_GAME_ID = 'mahjong-score';

export const QUESTION_COUNTS = [1, 5, 10] as const;
export type QuestionCount = (typeof QUESTION_COUNTS)[number];

export const mahjongScoreMeta = {
  id: MAHJONG_SCORE_GAME_ID,
  name: '立直麻将 · 点数练习',
  description: '看牌型算符翻，再填应付的点数',
  minPlayers: 1,
  maxPlayers: 1,
  minScore: 0,
  maxScore: 10,
} as const;
