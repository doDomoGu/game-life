import raw from '../data/words.json' with { type: 'json' };

export type WordCategory = 'noun' | 'action' | 'meme';

export interface WordEntry {
  text: string;
  category: WordCategory;
}

const HAN = /^[\u4e00-\u9fff]{2,6}$/;
const PLAN: WordCategory[] = [
  'noun',
  'noun',
  'noun',
  'noun',
  'noun',
  'action',
  'action',
  'action',
  'meme',
  'meme',
];

function shuffle<T>(list: T[]): T[] {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = next[i]!;
    next[i] = next[j]!;
    next[j] = current;
  }
  return next;
}

export function loadWordBank(): WordEntry[] {
  if (!Array.isArray(raw)) throw new Error('词库格式错误');
  const seen = new Set<string>();
  const list: WordEntry[] = [];
  for (const item of raw) {
    const text = String(item.text ?? '');
    const category = item.category;
    if (category !== 'noun' && category !== 'action' && category !== 'meme') {
      throw new Error(`词库分类无效：${text}`);
    }
    if (!HAN.test(text)) throw new Error(`词库词无效：${text}`);
    if (seen.has(text)) throw new Error(`词库重复：${text}`);
    seen.add(text);
    list.push({ text, category });
  }
  if (list.length < PLAN.length) throw new Error('词库不足 10 个词');
  return list;
}

function take(list: WordEntry[], used: Set<string>): WordEntry | undefined {
  return list.find((item) => !used.has(item.text));
}

/** 一局 10 个不重复的词：名词约一半，动名词组合约三成，网络热词约两成。 */
export function pickWords(bank: WordEntry[], count = PLAN.length): string[] {
  const buckets: Record<WordCategory, WordEntry[]> = {
    noun: shuffle(bank.filter((item) => item.category === 'noun')),
    action: shuffle(bank.filter((item) => item.category === 'action')),
    meme: shuffle(bank.filter((item) => item.category === 'meme')),
  };
  const used = new Set<string>();
  const picked: string[] = [];
  const rest = shuffle(bank);
  for (const category of shuffle(PLAN).slice(0, count)) {
    const found = take(buckets[category], used) ?? take(rest, used);
    if (!found) break;
    used.add(found.text);
    picked.push(found.text);
  }
  return picked;
}

export function shufflePlayers<T>(players: T[]): T[] {
  return shuffle(players);
}
