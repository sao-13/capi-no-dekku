import { addDays, parseDay, dayKey } from './dates';
import { isMastered } from './srs';
import type { AppData, DayKey, Id, Review } from './types';

export interface DayActivity {
  count: number;
  correct: number;
}

/** Every answer, from study or quiz, counts as one card studied on that day. */
export function activityByDay(reviews: Review[]): Map<DayKey, DayActivity> {
  const days = new Map<DayKey, DayActivity>();
  for (const r of reviews) {
    const d = days.get(r.day) ?? { count: 0, correct: 0 };
    d.count += 1;
    if (r.correct) d.correct += 1;
    days.set(r.day, d);
  }
  return days;
}

export interface StreakInfo {
  current: number;
  longest: number;
  studiedToday: boolean;
  /** Studied yesterday but not yet today: the streak ends at midnight unless they study. */
  atRisk: boolean;
}

export function streakInfo(days: Map<DayKey, DayActivity>, today: DayKey): StreakInfo {
  const studiedToday = days.has(today);
  const yesterday = addDays(today, -1);
  let current = 0;
  let cursor: DayKey | null = studiedToday ? today : days.has(yesterday) ? yesterday : null;
  while (cursor && days.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let prev: DayKey | null = null;
  for (const day of [...days.keys()].sort()) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = day;
  }

  return { current, longest, studiedToday, atRisk: !studiedToday && current > 0 };
}

/** Shade steps for the activity grid. Fixed thresholds so a square means the same thing every week. */
export const HEAT_LEVELS = [
  { min: 0, short: 'None' },
  { min: 1, short: '1–9' },
  { min: 10, short: '10–24' },
  { min: 25, short: '25–49' },
  { min: 50, short: '50+' },
] as const;

export function heatLevel(count: number): number {
  for (let i = HEAT_LEVELS.length - 1; i >= 0; i--) if (count >= HEAT_LEVELS[i].min) return i;
  return 0;
}

/** Monday of the week containing `day`. */
export function weekStart(day: DayKey): DayKey {
  const date = parseDay(day);
  const offset = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - offset);
  return dayKey(date);
}

/**
 * Columns of seven days (Monday to Sunday), oldest week first, ending with the week
 * that contains `today`. Days after today are null.
 */
export function heatmapWeeks(weeks: number, today: DayKey): (DayKey | null)[][] {
  const lastMonday = weekStart(today);
  const columns: (DayKey | null)[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const monday = addDays(lastMonday, -7 * w);
    const column: (DayKey | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const day = addDays(monday, d);
      column.push(day <= today ? day : null);
    }
    columns.push(column);
  }
  return columns;
}

export interface AccuracyPoint {
  /** First day of the bucket (a day, or the Monday of a week). */
  start: DayKey;
  total: number;
  correct: number;
  /** 0 to 100, or null when nothing was studied in the bucket. */
  accuracy: number | null;
}

/** Accuracy per day for the last `days` days, or per week for the last `weeks` weeks. */
export function accuracySeries(
  activity: Map<DayKey, DayActivity>,
  today: DayKey,
  range: { unit: 'day'; count: number } | { unit: 'week'; count: number },
): AccuracyPoint[] {
  const buckets: AccuracyPoint[] = [];
  if (range.unit === 'day') {
    for (let i = range.count - 1; i >= 0; i--) {
      const day = addDays(today, -i);
      const a = activity.get(day);
      buckets.push({ start: day, total: a?.count ?? 0, correct: a?.correct ?? 0, accuracy: null });
    }
  } else {
    const lastMonday = weekStart(today);
    for (let i = range.count - 1; i >= 0; i--) {
      const monday = addDays(lastMonday, -7 * i);
      let total = 0;
      let correct = 0;
      for (let d = 0; d < 7; d++) {
        const a = activity.get(addDays(monday, d));
        if (a) {
          total += a.count;
          correct += a.correct;
        }
      }
      buckets.push({ start: monday, total, correct, accuracy: null });
    }
  }
  for (const b of buckets) b.accuracy = b.total ? Math.round((b.correct / b.total) * 100) : null;
  return buckets;
}

export interface DeckProgress {
  deckId: Id;
  name: string;
  cards: number;
  mastered: number;
  reviews: number;
  accuracy: number | null;
  lastStudied: number | null;
}

export function deckProgress(data: AppData): DeckProgress[] {
  return data.decks
    .map((deck) => {
      const cards = data.cards.filter((c) => c.deckId === deck.id);
      const reviews = data.reviews.filter((r) => r.deckId === deck.id);
      const correct = reviews.filter((r) => r.correct).length;
      return {
        deckId: deck.id,
        name: deck.name,
        cards: cards.length,
        mastered: cards.filter(isMastered).length,
        reviews: reviews.length,
        accuracy: reviews.length ? Math.round((correct / reviews.length) * 100) : null,
        lastStudied: reviews.reduce<number | null>((max, r) => (max === null || r.ts > max ? r.ts : max), null),
      };
    })
    .sort((a, b) => (b.lastStudied ?? 0) - (a.lastStudied ?? 0));
}
