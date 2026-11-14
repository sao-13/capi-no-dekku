import type { Card } from './types';

export interface Question {
  card: Card;
  options: string[];
  answerIndex: number;
}

export function shuffle<T>(items: T[], rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Multiple-choice questions: the card's front is the prompt, its back is the answer, and the
 * wrong options are other cards' backs. Distractors of similar length are preferred so the
 * right answer can't be spotted by size alone. Falls back to other decks when a deck is small.
 */
export function buildQuiz(cards: Card[], fallbackBacks: string[], count: number, rng = Math.random): Question[] {
  const chosen = shuffle(cards, rng).slice(0, count);
  const deckBacks = [...new Map(cards.map((c) => [norm(c.back), c.back])).values()];
  const extraBacks = fallbackBacks.filter((b) => !deckBacks.some((d) => norm(d) === norm(b)));

  return chosen.map((card) => {
    const correct = norm(card.back);
    const pick = (pool: string[], n: number) => {
      const candidates = pool.filter((b) => norm(b) !== correct);
      // Rank by closeness in length, then take a random three from the closest six.
      const ranked = shuffle(candidates, rng).sort(
        (a, b) => Math.abs(a.length - card.back.length) - Math.abs(b.length - card.back.length),
      );
      return shuffle(ranked.slice(0, Math.max(n * 2, n)), rng).slice(0, n);
    };
    // Gizmo Style cards bring their own wrong answers.
    let distractors = card.wrong?.filter((w) => w.trim()).slice(0, 3) ?? [];
    if (distractors.length < 3) distractors = [...distractors, ...pick(deckBacks.filter((b) => !distractors.includes(b)), 3 - distractors.length)];
    if (distractors.length < 3) distractors = [...distractors, ...pick(extraBacks, 3 - distractors.length)];
    const options = shuffle([card.back, ...distractors], rng);
    return { card, options, answerIndex: options.indexOf(card.back) };
  });
}

/** Whether a quiz can be built: at least two distinct answers must exist. */
export function canQuiz(cards: Card[], fallbackBacks: string[]): boolean {
  // Gizmo Style cards carry their own wrong answers, so one of them is enough for a quiz.
  const answers = new Set([...cards.flatMap((c) => [c.back, ...(c.wrong ?? [])]).map(norm), ...fallbackBacks.map(norm)]);
  return cards.length >= 1 && answers.size >= 2;
}
