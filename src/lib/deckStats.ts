import { isNewCard } from './srs';
import type { AppData, Card, Id } from './types';

export interface DeckSummary {
  total: number;
  /** Cards never studied. */
  fresh: number;
  /** Cards studied at least once. */
  studied: number;
  lastStudied: number | null;
}

export function summarizeDeck(data: AppData, deckId: Id): DeckSummary {
  const cards = data.cards.filter((c) => c.deckId === deckId);
  let lastStudied: number | null = null;
  for (const r of data.reviews) {
    if (r.deckId === deckId && (lastStudied === null || r.ts > lastStudied)) lastStudied = r.ts;
  }
  const fresh = cards.filter(isNewCard).length;
  return {
    total: cards.length,
    fresh,
    studied: cards.length - fresh,
    lastStudied,
  };
}

export const cardsInDeck = (data: AppData, deckId: Id): Card[] => data.cards.filter((c) => c.deckId === deckId);
