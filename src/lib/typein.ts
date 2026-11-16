import { plainText } from './markup';

/** A word the learner typed, in their own spelling. */
export interface TypedWord {
  text: string;
  right: boolean;
}

/** A piece of the correct answer: a word or the whitespace between words. */
export interface AnswerPart {
  text: string;
  missed: boolean;
}

export interface TypeinResult {
  typed: TypedWord[];
  answer: AnswerPart[];
  correct: boolean;
}

const normalise = (word: string) => word.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');

/** Typos forgiven for an answer word: none under 5 letters, one from 5, two from 9. */
function allowance(word: string): number {
  const n = [...word].length;
  return n >= 9 ? 2 : n >= 5 ? 1 : 0;
}

function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[y.length];
}

/**
 * Forgiving check of a typed answer: ignores case, punctuation, spacing and markup,
 * allows small typos, and lines the words up in order.
 */
export function gradeTyped(typedText: string, answerText: string): TypeinResult {
  const answerParts = plainText(answerText)
    .trim()
    .split(/(\s+)/)
    .filter(Boolean)
    .map((text) => ({ text, key: /^\s+$/.test(text) ? '' : normalise(text) }));
  const typedTokens = typedText
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ text, key: normalise(text) }));

  // Only words that still hold letters or digits take part; lone punctuation is ignored.
  const want = answerParts.map((p, i) => ({ key: p.key, i })).filter((p) => p.key);
  const got = typedTokens.map((t, i) => ({ key: t.key, i })).filter((t) => t.key);

  if (!got.length) {
    return { typed: [], answer: answerParts.map((p) => ({ text: p.text, missed: !!p.key })), correct: false };
  }

  const fits = (g: string, w: string) => g === w || editDistance(g, w) <= allowance(w);

  // Longest in-order run of matching words (LCS), filled from the end.
  const rows = got.length;
  const cols = want.length;
  const best = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      best[i][j] = fits(got[i].key, want[j].key) ? best[i + 1][j + 1] + 1 : Math.max(best[i + 1][j], best[i][j + 1]);
    }
  }

  const rightTyped = new Set<number>();
  const matchedAnswer = new Set<number>();
  for (let i = 0, j = 0; i < rows && j < cols; ) {
    if (fits(got[i].key, want[j].key) && best[i][j] === best[i + 1][j + 1] + 1) {
      rightTyped.add(got[i].i);
      matchedAnswer.add(want[j].i);
      i++;
      j++;
    } else if (best[i + 1][j] >= best[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  const typed = typedTokens.map((t, i) => ({ text: t.text, right: !t.key || rightTyped.has(i) }));
  const answer = answerParts.map((p, i) => ({ text: p.text, missed: !!p.key && !matchedAnswer.has(i) }));
  const correct = matchedAnswer.size === want.length && rightTyped.size === got.length;
  return { typed, answer, correct };
}
