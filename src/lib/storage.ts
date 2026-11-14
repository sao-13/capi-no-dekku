import type { AppData } from './types';

export const DATA_KEY = 'margin:data:v1';

export const emptyData = (): AppData => ({ version: 1, decks: [], cards: [], reviews: [], quizzes: [] });

export type LoadResult =
  | { status: 'ok'; data: AppData }
  /** Stored data could not be read; it was copied to a backup key and the app started fresh. */
  | { status: 'recovered'; data: AppData; backupKey: string }
  | { status: 'unavailable'; data: AppData };

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.version === 1 && [v.decks, v.cards, v.reviews, v.quizzes].every(Array.isArray);
}

export function loadData(): LoadResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(DATA_KEY);
  } catch {
    return { status: 'unavailable', data: emptyData() };
  }
  if (raw === null) return { status: 'ok', data: emptyData() };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isAppData(parsed)) return { status: 'ok', data: parsed };
  } catch {
    // fall through to recovery
  }

  const backupKey = `margin:data:unreadable:${Date.now()}`;
  try {
    localStorage.setItem(backupKey, raw);
  } catch {
    // If even the backup fails there is nothing more we can do safely.
  }
  return { status: 'recovered', data: emptyData(), backupKey };
}

export function saveData(data: AppData): SaveResult {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

/** Approximate bytes used by Capi’s Deck's data, for the storage note in settings. */
export function storageUsage(data: AppData): number {
  return new Blob([JSON.stringify(data)]).size;
}
