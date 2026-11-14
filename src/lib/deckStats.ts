import { dueItems, isMastered } from './srs';
import type { AppData, Card, DayKey, Id } from './types';

export interface DeckSummary {
  total: number;
  due: number;
  fresh: number;
  mastered: number;
  lastStudied: number | null;
}

export function summarizeDeck(data: AppData, deckId: Id, today: DayKey): DeckSummary {
  const cards = data.cards.filter((c) => c.deckId === deckId);
  let lastStudied: number | null = null;
  for (const r of data.reviews) {
    if (r.deckId === deckId && (lastStudied === null || r.ts > lastStudied)) lastStudied = r.ts;
  }
  return {
    total: cards.length,
    /** Review items due: a reversed card can count twice, a cloze card once per deletion. */
    due: cards.reduce((n, c) => n + dueItems(c, today).length, 0),
    fresh: cards.filter((c) => c.srs.reps === 0).length,
    mastered: cards.filter(isMastered).length,
    lastStudied,
  };
}

export const cardsInDeck = (data: AppData, deckId: Id): Card[] => data.cards.filter((c) => c.deckId === deckId);
