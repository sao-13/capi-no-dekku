import { addDays, dayKey } from './dates';
import { clozeNumbers } from './markup';
import type { Card, CardType, DayKey, Grade, Review, Srs } from './types';

/**
 * A small Leitner-style ladder. Grade 1 ("understood well") moves an item up one rung and
 * pushes its next review out to that rung's interval; grade 2 ("almost") keeps the rung and
 * leaves it due today; grade 3 ("didn't understand") sends it back to the bottom so it
 * comes back later in the same session and again tomorrow.
 */
export const INTERVALS = [0, 1, 3, 7, 16, 35, 80] as const;
export const MASTERED_BOX = 4; // 16+ days between reviews
const TOP_BOX = INTERVALS.length - 1;

export const newSrs = (today: DayKey): Srs => ({ box: 0, due: today, reps: 0, lapses: 0, lastReviewed: null });

export function schedule(srs: Srs, grade: Grade, today: DayKey, now = Date.now()): Srs {
  if (grade === 2) return { ...srs, due: today, reps: srs.reps + 1, lastReviewed: now };
  if (grade === 3) {
    return {
      box: 0,
      due: today,
      reps: srs.reps + 1,
      lapses: srs.reps > 0 ? srs.lapses + 1 : srs.lapses,
      lastReviewed: now,
    };
  }
  const box = Math.min(srs.box + 1, TOP_BOX);
  return { box, due: addDays(today, INTERVALS[box]), reps: srs.reps + 1, lapses: srs.lapses, lastReviewed: now };
}

/** Days until the item would next be shown if rated "understood well" now. */
export const nextIntervalDays = (srs: Srs) => INTERVALS[Math.min(srs.box + 1, TOP_BOX)];

export function describeInterval(days: number): string {
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  if (days < 30) return `in ${days} days`;
  const months = Math.round(days / 30);
  return months === 1 ? 'in a month' : `in ${months} months`;
}

/* Review items: one card can be reviewed several ways, each on its own schedule. */

export const typeOf = (card: Card): CardType => card.type ?? 'basic';

/** The ways a card is asked: 'fwd', 'rev', 'c1', 'c2', …, or one per occlusion mask id. */
export function variantsOf(card: Card): string[] {
  switch (typeOf(card)) {
    case 'reversed':
      return ['fwd', 'rev'];
    case 'cloze': {
      const nums = clozeNumbers(card.front);
      return nums.length ? nums.map((n) => `c${n}`) : ['c1'];
    }
    case 'occlusion': {
      const masks = card.occlusion?.masks ?? [];
      return masks.length ? masks.map((m) => m.id) : ['img'];
    }
    default:
      return ['fwd'];
  }
}

export interface Item {
  card: Card;
  variant: string;
  srs: Srs;
  key: string;
}

export const itemKey = (cardId: string, variant: string) => `${cardId}|${variant}`;

export function itemsOf(card: Card): Item[] {
  const created = dayKey(new Date(card.createdAt));
  return variantsOf(card).map((variant, i) => ({
    card,
    variant,
    srs: i === 0 ? card.srs : (card.variantSrs?.[variant] ?? newSrs(created)),
    key: itemKey(card.id, variant),
  }));
}

/** Store a variant's new schedule on the card. */
export function withVariantSrs(card: Card, variant: string, srs: Srs): Card {
  if (variantsOf(card)[0] === variant) return { ...card, srs };
  return { ...card, variantSrs: { ...card.variantSrs, [variant]: srs } };
}

export const isDue = (card: Card, today: DayKey) => itemsOf(card).some((i) => i.srs.due <= today);
export const dueItems = (card: Card, today: DayKey) => itemsOf(card).filter((i) => i.srs.due <= today);
export const isMastered = (card: Card) => itemsOf(card).every((i) => i.srs.box >= MASTERED_BOX);
export const nextDueDay = (card: Card) => itemsOf(card).map((i) => i.srs.due).sort()[0];

/** Never studied: every way the card is asked still has no answers. */
export const isNewCard = (card: Card) => itemsOf(card).every((i) => i.srs.reps === 0);

export type CardCategory = 'new' | 'easy' | 'recall' | 'weak';

export const CATEGORY_LABEL: Record<CardCategory, string> = {
  new: 'New',
  easy: 'Easy',
  recall: 'Can recall',
  weak: 'Weak memory',
};

export interface LatestGrade {
  ts: number;
  grade: Grade;
}

/**
 * The latest study rating per review item, keyed by itemKey(cardId, variant). Reviews saved
 * without a variant are keyed with an empty variant; cardCategory treats them as the first one.
 */
export function latestGrades(reviews: Review[]): Map<string, LatestGrade> {
  const map = new Map<string, LatestGrade>();
  for (const r of reviews) {
    if (r.mode !== 'study') continue;
    const key = itemKey(r.cardId, r.variant ?? '');
    const prev = map.get(key);
    if (!prev || r.ts > prev.ts) map.set(key, { ts: r.ts, grade: r.grade ?? (r.correct ? 1 : 3) });
  }
  return map;
}

/** A label from the last rating of each studied item, taking the weakest. Scheduling ignores it. */
export function cardCategory(card: Card, grades: Map<string, LatestGrade>): CardCategory {
  const items = itemsOf(card);
  // Checked first so a reset card reads as New even though its old reviews remain.
  if (items.every((i) => i.srs.reps === 0)) return 'new';
  let weakest: Grade | 0 = 0;
  items.forEach((item, index) => {
    // Items not studied since a reset are skipped so their pre-reset ratings don't count.
    if (item.srs.reps === 0) return;
    let latest = grades.get(item.key);
    const legacy = index === 0 ? grades.get(itemKey(card.id, '')) : undefined;
    if (legacy && (!latest || legacy.ts > latest.ts)) latest = legacy;
    if (latest && latest.grade > weakest) weakest = latest.grade;
  });
  if (weakest === 0) return items.some((i) => i.srs.reps > 0 && i.srs.box === 0) ? 'weak' : 'easy';
  return weakest === 3 ? 'weak' : weakest === 2 ? 'recall' : 'easy';
}

export const TYPE_LABEL: Record<CardType, string> = {
  basic: 'Basic',
  reversed: 'Basic and reversed',
  cloze: 'Cloze',
  occlusion: 'Image occlusion',
  mcq: 'Gizmo Style',
  typein: 'Type-in',
};
