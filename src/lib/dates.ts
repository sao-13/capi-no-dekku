import type { DayKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(date: Date = new Date()): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(): DayKey {
  return dayKey(new Date());
}

/** Parse a day key as local midnight. */
export function parseDay(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = parseDay(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const monthYear = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

export const formatLongDate = (key: DayKey) => longDate.format(parseDay(key));
export const formatShortDate = (key: DayKey) => shortDate.format(parseDay(key));
export const formatMonthYear = (date: Date) => monthYear.format(date);

/** "today", "tomorrow", "Thursday", or "12 Nov" depending on distance. */
export function formatRelativeDay(key: DayKey, from: DayKey = todayKey()): string {
  const diff = daysBetween(from, key);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return weekday.format(parseDay(key));
  return shortDate.format(parseDay(key));
}

export function formatAgo(ts: number | null): string {
  if (!ts) return 'Never';
  const diff = daysBetween(dayKey(new Date(ts)), todayKey());
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return shortDate.format(new Date(ts));
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
