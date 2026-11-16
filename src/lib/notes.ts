import { useSyncExternalStore } from 'react';

/**
 * Sticky notes: one note per card, plus a note per deck. Saved in this browser only.
 * Deck notes and the open state keep the old notebook's keys, so earlier notebook text carries over.
 */
const CARD_NOTES_KEY = 'margin:notes';
const OPEN_KEY = 'margin:notebook:open';
const deckKey = (scope: string) => `margin:notebook:${scope}`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Kept for this visit only.
  }
}

function loadCardNotes(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(read(CARD_NOTES_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

let cardNotes = loadCardNotes();
let open = read(OPEN_KEY) === 'true';
const deckNotes = new Map<string, string>();
const listeners = new Set<() => void>();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const emit = () => listeners.forEach((l) => l());

function deckNote(scope: string): string {
  let text = deckNotes.get(scope);
  if (text === undefined) {
    text = read(deckKey(scope)) ?? '';
    deckNotes.set(scope, text);
  }
  return text;
}

export const useCardNote = (cardId: string) => useSyncExternalStore(subscribe, () => cardNotes[cardId] ?? '');

export function setCardNote(cardId: string, text: string) {
  const next = { ...cardNotes };
  if (text) next[cardId] = text;
  else delete next[cardId];
  cardNotes = next;
  write(CARD_NOTES_KEY, JSON.stringify(next));
  emit();
}

/** The deck's note ('all' for mixed review). */
export const useDeckNote = (scope: string) => useSyncExternalStore(subscribe, () => deckNote(scope));

export function setDeckNote(scope: string, text: string) {
  deckNotes.set(scope, text);
  write(deckKey(scope), text);
  emit();
}

export const useNotesOpen = () => useSyncExternalStore(subscribe, () => open);

export function setNotesOpen(next: boolean) {
  open = next;
  write(OPEN_KEY, String(next));
  emit();
}
