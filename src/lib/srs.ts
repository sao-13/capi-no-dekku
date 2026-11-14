import { addDays, dayKey } from './dates';
import { clozeNumbers } from './markup';
import type { Card, CardType, DayKey, Srs } from './types';

/**
 * A small Leitner-style ladder. "Knew it" moves an item up one rung and pushes its
 * next review out to that rung's interval; "Again" sends it back to the bottom
 * so it comes back later in the same session and again tomorrow.
 */
export const INTERVALS = [0, 1, 3, 7, 16, 35, 80] as const;
export const MASTERED_BOX = 4; // 16+ days between reviews
const TOP_BOX = INTERVALS.length - 1;

export const newSrs = (today: DayKey): Srs => ({ box: 0, due: today, reps: 0, lapses: 0, lastReviewed: null });

export function schedule(srs: Srs, knewIt: boolean, today: DayKey, now = Date.now()): Srs {
  if (!knewIt) {
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

/** Days until the item would next be shown if answered "knew it" now. */
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

export type CardStatus = 'new' | 'learning' | 'mastered';

export function cardStatus(card: Card): CardStatus {
  const items = itemsOf(card);
  if (items.every((i) => i.srs.reps === 0)) return 'new';
  return isMastered(card) ? 'mastered' : 'learning';
}

export const TYPE_LABEL: Record<CardType, string> = {
  basic: 'Basic',
  reversed: 'Basic and reversed',
  cloze: 'Cloze',
  occlusion: 'Image occlusion',
  mcq: 'Gizmo Style',
};
