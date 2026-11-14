import { useSyncExternalStore } from 'react';
import { todayKey } from './dates';
import { itemsOf, newSrs, schedule, withVariantSrs } from './srs';
import { loadData, saveData } from './storage';
import type { AppData, Card, CardType, Deck, Id, Occlusion, QuizResult, Review } from './types';

export type SaveError = 'quota' | 'unavailable' | null;
export type LoadNotice = { kind: 'recovered'; backupKey: string } | { kind: 'unavailable' } | null;

export interface Snapshot {
  data: AppData;
  saveError: SaveError;
  loadNotice: LoadNotice;
}

const initial = loadData();

let snapshot: Snapshot = {
  data: initial.data,
  saveError: initial.status === 'unavailable' ? 'unavailable' : null,
  loadNotice:
    initial.status === 'recovered'
      ? { kind: 'recovered', backupKey: initial.backupKey }
      : initial.status === 'unavailable'
        ? { kind: 'unavailable' }
        : null,
};

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Apply a change, persist it, and notify subscribers. Changes stay in memory even if saving fails. */
function commit(update: (data: AppData) => AppData) {
  const data = update(snapshot.data);
  const result = saveData(data);
  snapshot = { ...snapshot, data, saveError: result.ok ? null : result.reason };
  emit();
}

export function useStore(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function useData(): AppData {
  return useStore().data;
}

export const uid = (): Id =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/* Decks */

export function createDeck(input: { name: string; description?: string }): Deck {
  const now = Date.now();
  const deck: Deck = {
    id: uid(),
    name: input.name.trim(),
    description: (input.description ?? '').trim(),
    createdAt: now,
    updatedAt: now,
  };
  commit((d) => ({ ...d, decks: [deck, ...d.decks] }));
  return deck;
}

export function updateDeck(id: Id, patch: Partial<Pick<Deck, 'name' | 'description'>>) {
  commit((d) => ({
    ...d,
    decks: d.decks.map((deck) =>
      deck.id === id
        ? {
            ...deck,
            ...(patch.name !== undefined && { name: patch.name.trim() }),
            ...(patch.description !== undefined && { description: patch.description.trim() }),
            updatedAt: Date.now(),
          }
        : deck,
    ),
  }));
}

/** Removes a deck and its cards. Review history is kept so streaks and the activity grid stay true. */
export function deleteDeck(id: Id) {
  commit((d) => ({
    ...d,
    decks: d.decks.filter((deck) => deck.id !== id),
    cards: d.cards.filter((card) => card.deckId !== id),
  }));
}

/* Cards */

export function addCards(deckId: Id, cards: { front: string; back: string }[]): Card[] {
  const today = todayKey();
  const now = Date.now();
  const created = cards
    .map((c) => ({ front: c.front.trim(), back: c.back.trim() }))
    .filter((c) => c.front && c.back)
    .map<Card>((c, i) => ({ id: uid(), deckId, ...c, createdAt: now + i, srs: newSrs(today) }));
  if (created.length === 0) return created;
  commit((d) => ({
    ...d,
    cards: [...d.cards, ...created],
    decks: d.decks.map((deck) => (deck.id === deckId ? { ...deck, updatedAt: now } : deck)),
  }));
  return created;
}

export interface CardInput {
  type: CardType;
  front: string;
  back: string;
  occlusion?: Occlusion;
  wrong?: string[];
}

export function addCard(deckId: Id, input: CardInput): Card {
  const now = Date.now();
  const card: Card = {
    id: uid(),
    deckId,
    type: input.type,
    front: input.front.trim(),
    back: input.back.trim(),
    ...(input.occlusion && { occlusion: input.occlusion }),
    ...(input.wrong && { wrong: input.wrong.map((w) => w.trim()) }),
    createdAt: now,
    srs: newSrs(todayKey()),
  };
  commit((d) => ({
    ...d,
    cards: [...d.cards, card],
    decks: d.decks.map((deck) => (deck.id === deckId ? { ...deck, updatedAt: now } : deck)),
  }));
  return card;
}

export function updateCard(id: Id, input: Partial<CardInput>) {
  commit((d) => ({
    ...d,
    cards: d.cards.map((card) =>
      card.id === id
        ? {
            ...card,
            ...(input.type !== undefined && { type: input.type }),
            ...(input.front !== undefined && { front: input.front.trim() }),
            ...(input.back !== undefined && { back: input.back.trim() }),
            ...(input.occlusion !== undefined && { occlusion: input.occlusion }),
            ...(input.wrong !== undefined && { wrong: input.wrong.map((w) => w.trim()) }),
          }
        : card,
    ),
  }));
}

export function deleteCard(id: Id): { card: Card; index: number } | null {
  const index = snapshot.data.cards.findIndex((c) => c.id === id);
  if (index === -1) return null;
  const card = snapshot.data.cards[index];
  commit((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== id) }));
  return { card, index };
}

export function restoreCard(removed: { card: Card; index: number }) {
  commit((d) => {
    if (!d.decks.some((deck) => deck.id === removed.card.deckId)) return d;
    const cards = [...d.cards];
    cards.splice(Math.min(removed.index, cards.length), 0, removed.card);
    return { ...d, cards };
  });
}

/* Studying */

export function answerStudy(cardId: Id, variant: string, knewIt: boolean) {
  const today = todayKey();
  const now = Date.now();
  commit((d) => {
    const card = d.cards.find((c) => c.id === cardId);
    const item = card && itemsOf(card).find((i) => i.variant === variant);
    if (!card || !item) return d;
    const review: Review = { id: uid(), cardId, variant, deckId: card.deckId, ts: now, day: today, mode: 'study', correct: knewIt };
    const next = withVariantSrs(card, variant, schedule(item.srs, knewIt, today, now));
    return {
      ...d,
      cards: d.cards.map((c) => (c.id === cardId ? next : c)),
      reviews: [...d.reviews, review],
    };
  });
}

export function recordQuiz(deckId: Id, answers: { cardId: Id; correct: boolean }[]): QuizResult {
  const today = todayKey();
  const now = Date.now();
  const result: QuizResult = {
    id: uid(),
    deckId,
    ts: now,
    day: today,
    total: answers.length,
    correct: answers.filter((a) => a.correct).length,
  };
  const reviews: Review[] = answers.map((a, i) => ({
    id: uid(),
    cardId: a.cardId,
    deckId,
    ts: now + i,
    day: today,
    mode: 'quiz',
    correct: a.correct,
  }));
  commit((d) => ({ ...d, reviews: [...d.reviews, ...reviews], quizzes: [...d.quizzes, result] }));
  return result;
}

/* Notices */

export function dismissLoadNotice() {
  snapshot = { ...snapshot, loadNotice: null };
  emit();
}

/** Retry a save after the learner has freed space. */
export function retrySave() {
  commit((d) => d);
}
