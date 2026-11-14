import { useSyncExternalStore } from 'react';
import { MESSAGES } from '../content/messages';
import { showPopup } from './popup';
import { fluffOn } from './settings';

/** Hint keys: each hint costs one. Change STARTING_KEYS to hand out a different amount. */
export const STARTING_KEYS = 10;
const KEY = 'margin:keys';

function load(): number {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? STARTING_KEYS : Math.max(0, Number(raw) || 0);
  } catch {
    return STARTING_KEYS;
  }
}

let keys = load();
const listeners = new Set<() => void>();

function set(n: number) {
  keys = n;
  try {
    localStorage.setItem(KEY, String(n));
  } catch {
    // Counted for this visit only.
  }
  listeners.forEach((l) => l());
}

export const useKeys = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => keys,
  );

/** Spend one key. With none left, shows the "ask for more keys" pop-up and returns false. */
export function spendKey(): boolean {
  // No fluff mode drops the key game: hints are free.
  if (!fluffOn()) return true;
  if (keys <= 0) {
    showPopup(MESSAGES.outOfKeys, 'warn');
    return false;
  }
  set(keys - 1);
  return true;
}

/** For whoever hands out keys: addKeys(10) in the browser console, or call it from a future reward. */
export function addKeys(n: number) {
  set(keys + n);
}

(window as unknown as { addKeys: typeof addKeys }).addKeys = addKeys;
