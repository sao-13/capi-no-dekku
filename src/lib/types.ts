export type Id = string;

/** A calendar day in the learner's local time, formatted YYYY-MM-DD. */
export type DayKey = string;

export interface Deck {
  id: Id;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface Srs {
  /** Position on the interval ladder; 0 means new or just forgotten. */
  box: number;
  due: DayKey;
  reps: number;
  lapses: number;
  lastReviewed: number | null;
}

export type CardType = 'basic' | 'reversed' | 'cloze' | 'occlusion' | 'mcq' | 'typein';

/** A rectangle hidden on an image, in fractions (0 to 1) of the image's width and height. */
export interface Mask {
  id: Id;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Occlusion {
  /** Key of the image blob in IndexedDB (see lib/images.ts). */
  imageId: Id;
  width: number;
  height: number;
  masks: Mask[];
  /** hide-one: only the asked mask is covered. hide-all: every mask is covered, the asked one is marked. */
  mode: 'hide-one' | 'hide-all';
}

/**
 * Text fields hold light markup: **bold**, *italic*, __underline__, ==highlight==,
 * $math$ / $$display math$$ (KaTeX), and {{c1::cloze}} deletions.
 */
export interface Card {
  id: Id;
  deckId: Id;
  /** Missing on cards made before card types existed; treat as 'basic'. */
  type?: CardType;
  /** Basic/reversed: the question. Cloze: the text with deletions. Occlusion: an optional header. */
  front: string;
  /** Basic/reversed: the answer. Cloze and occlusion: extra notes shown after answering. */
  back: string;
  occlusion?: Occlusion;
  /** Gizmo Style (mcq) cards: the three wrong choices. front is the question, back the right answer. */
  wrong?: string[];
  createdAt: number;
  /** Schedule for the card's first review item (see itemsOf in lib/srs.ts). */
  srs: Srs;
  /** Schedules for the other items: the reverse side, cloze 2+, or other masks. */
  variantSrs?: Record<string, Srs>;
}

export type ReviewMode = 'study' | 'quiz';

/** Study rating: 1 understood well, 2 almost (back in 5 minutes), 3 didn't understand. */
export type Grade = 1 | 2 | 3;

export interface Review {
  id: Id;
  cardId: Id;
  variant?: string;
  deckId: Id;
  ts: number;
  day: DayKey;
  mode: ReviewMode;
  correct: boolean;
  /** Study answers only; missing on older reviews. */
  grade?: Grade;
}

export interface QuizResult {
  id: Id;
  deckId: Id;
  ts: number;
  day: DayKey;
  total: number;
  correct: number;
}

export interface AppData {
  version: 1;
  decks: Deck[];
  cards: Card[];
  reviews: Review[];
  quizzes: QuizResult[];
}
