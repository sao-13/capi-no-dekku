import { useSyncExternalStore } from 'react';
import { fluffOn } from './settings';

export interface Popup {
  id: number;
  text: string;
  tone: 'cheer' | 'warn';
}

let current: Popup | null = null;
let nextId = 1;
let timer: number | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function closePopup() {
  current = null;
  window.clearTimeout(timer);
  emit();
}

/** A cute message bubble in the middle of the screen. Newer pop-ups replace older ones. */
export function showPopup(text: string, tone: Popup['tone'] = 'cheer', ms = 3200) {
  if (!text || !fluffOn()) return;
  current = { id: nextId++, text, tone };
  window.clearTimeout(timer);
  timer = window.setTimeout(closePopup, ms);
  emit();
}

export const usePopup = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
