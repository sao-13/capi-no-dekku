import { clozeNumbers } from './markup';
import { prepareImage, putImage } from './images';
import { uid, type CardInput } from './store';
import type { Card, CardType, Mask, Occlusion } from './types';

/** What the card editor holds while a card is being written. */
export interface CardDraft {
  type: CardType;
  front: string;
  back: string;
  image?: {
    /** Already stored image (editing an existing card). */
    imageId?: string;
    /** New image not yet stored, with a preview URL. */
    blob?: Blob;
    url?: string;
    width: number;
    height: number;
  };
  masks: Mask[];
  mode: Occlusion['mode'];
  /** Gizmo Style: three wrong choices. */
  wrong: string[];
}

export const emptyDraft = (type: CardType = 'basic'): CardDraft => ({ type, front: '', back: '', masks: [], mode: 'hide-one', wrong: ['', '', ''] });

/** Start a new draft of the same type, keeping the image settings out of it. */
export const nextDraft = (d: CardDraft): CardDraft => emptyDraft(d.type);

export function draftFromCard(card: Card): CardDraft {
  return {
    type: card.type ?? 'basic',
    front: card.front,
    back: card.back,
    image: card.occlusion && { imageId: card.occlusion.imageId, width: card.occlusion.width, height: card.occlusion.height },
    masks: card.occlusion?.masks ?? [],
    mode: card.occlusion?.mode ?? 'hide-one',
    wrong: [0, 1, 2].map((i) => card.wrong?.[i] ?? ''),
  };
}

export async function imageDraftFrom(file: Blob): Promise<NonNullable<CardDraft['image']>> {
  const prepared = await prepareImage(file);
  return { blob: prepared.blob, url: URL.createObjectURL(prepared.blob), width: prepared.width, height: prepared.height };
}

/** Returns a message saying what's missing, or null when the draft can be saved. */
export function validateDraft(d: CardDraft): string | null {
  switch (d.type) {
    case 'basic':
    case 'reversed':
      if (!d.front.trim() && !d.back.trim()) return 'Write both sides before adding the card.';
      if (!d.front.trim()) return 'The front is empty.';
      if (!d.back.trim()) return 'The back is empty.';
      return null;
    case 'cloze':
      if (!d.front.trim()) return 'Write the text first, then hide parts of it.';
      if (!clozeNumbers(d.front).length) return 'Hide at least one part: select words and press the cloze button (Ctrl+Shift+C).';
      return null;
    case 'mcq': {
      if (!d.front.trim()) return 'Write the question.';
      if (!d.back.trim()) return 'Write the correct answer.';
      const filled = d.wrong.filter((w) => w.trim());
      if (filled.length < 3) return `Add ${3 - filled.length === 1 ? 'one more wrong answer' : `${3 - filled.length} more wrong answers`} (three in all).`;
      const all = [d.back, ...d.wrong].map((x) => x.trim().toLowerCase());
      if (new Set(all).size < 4) return 'Each choice needs to be different.';
      return null;
    }
    case 'occlusion':
      if (!d.image) return 'Choose an image to hide parts of.';
      if (!d.masks.length) return 'Draw at least one box over the part to hide.';
      return null;
  }
}

/** Store any new image and turn the draft into what the store saves. */
export async function draftToInput(d: CardDraft): Promise<CardInput> {
  if (d.type === 'mcq') return { type: 'mcq', front: d.front, back: d.back, wrong: d.wrong };
  if (d.type !== 'occlusion' || !d.image) return { type: d.type, front: d.front, back: d.back };
  let imageId = d.image.imageId;
  if (!imageId && d.image.blob) {
    imageId = uid();
    await putImage(imageId, d.image.blob);
  }
  return {
    type: 'occlusion',
    front: d.front,
    back: d.back,
    occlusion: { imageId: imageId!, width: d.image.width, height: d.image.height, masks: d.masks, mode: d.mode },
  };
}
