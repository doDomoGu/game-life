import type { HandFacts, PointAnswer } from './types.js';

export function ceil100(value: number) {
  return Math.ceil(value / 100) * 100;
}

export function limitFor(han: number, fu: number) {
  if (han >= 13) return { label: '役满', base: 8000 };
  if (han >= 11) return { label: '三倍满', base: 6000 };
  if (han >= 8) return { label: '倍满', base: 4000 };
  if (han >= 6) return { label: '跳满', base: 3000 };
  if (han >= 5 || (han === 4 && fu >= 40) || (han === 3 && fu >= 70)) {
    return { label: '满贯', base: 2000 };
  }
  return null;
}

export function calculatePoints(question: HandFacts & { han: number; fu: number }): PointAnswer {
  const limit = limitFor(question.han, question.fu);
  const base = limit ? limit.base : Math.min(2000, question.fu * 2 ** (question.han + 2));
  const honba = question.honba;
  if (question.winType === 'ron') {
    return {
      ron: ceil100(base * (question.dealer ? 6 : 4)) + honba * 300,
      base,
      limitLabel: limit ? limit.label : `${question.fu}符 ${question.han}翻`,
    };
  }
  if (question.dealer) {
    return {
      each: ceil100(base * 2) + honba * 100,
      base,
      limitLabel: limit ? limit.label : `${question.fu}符 ${question.han}翻`,
    };
  }
  return {
    child: ceil100(base) + honba * 100,
    dealer: ceil100(base * 2) + honba * 100,
    base,
    limitLabel: limit ? limit.label : `${question.fu}符 ${question.han}翻`,
  };
}

export function formatPoints(value: number) {
  return `${value.toLocaleString('zh-CN')} 点`;
}

export function expectedText(question: HandFacts & { fu: number; han: number; answer: PointAnswer }) {
  const scoreText = `符数 ${question.fu} 符，${question.han} 翻。`;
  if (question.winType === 'ron') return `${scoreText}点炮者支付 ${formatPoints(question.answer.ron ?? 0)}。`;
  if (question.dealer) return `${scoreText}三家各支付 ${formatPoints(question.answer.each ?? 0)}。`;
  return `${scoreText}两位子家各支付 ${formatPoints(question.answer.child ?? 0)}，庄家支付 ${formatPoints(question.answer.dealer ?? 0)}。`;
}

export function explanation(question: HandFacts & { fu: number; han: number; answer: PointAnswer }) {
  const answer = question.answer;
  const baseText = answer.limitLabel.includes('满')
    ? `${answer.limitLabel}的基本点为 ${answer.base.toLocaleString('zh-CN')}。`
    : `基本点 = ${question.fu} × 2^(${question.han} + 2) = ${answer.base.toLocaleString('zh-CN')}。`;
  const roundText = question.winType === 'ron'
    ? `荣和按庄家 ${answer.base}×6、子家 ${answer.base}×4，再向上取整到百位。`
    : '自摸时，庄家支付基本点×2，子家支付基本点；每一笔都向上取整到百位。';
  const honbaText = question.honba
    ? `本场加成：${question.honba}×${question.winType === 'ron' ? 300 : 100} 点。`
    : '本场加成：0 点。';
  return `${baseText} ${roundText} ${honbaText}`;
}
