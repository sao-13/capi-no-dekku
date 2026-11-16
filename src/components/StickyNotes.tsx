import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { setCardNote, setDeckNote, useCardNote, useDeckNote } from '../lib/notes';
import { fluffOn } from '../lib/settings';
import './StickyNotes.css';

export const STICKY_NOTES_ID = 'sticky-notes';
const PEEL_MS = 200;

interface Props {
  /** The card on screen: its note shows on the "This card" tab. */
  cardId: string;
  /** Deck note scope: the deck id, or 'all' for mixed review. */
  scope: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A small 90s-style note window: one note per card, plus the deck's note. */
export function StickyNotes({ cardId, scope, open, onOpenChange }: Props) {
  const [tab, setTab] = useState<'card' | 'deck'>('card');
  // Stays true while the closing peel plays, so the note can animate out before it unmounts.
  const [shown, setShown] = useState(open);
  const cardNote = useCardNote(cardId);
  const deckNote = useDeckNote(scope);

  useEffect(() => {
    if (open) {
      setShown(true);
      return;
    }
    const animated = fluffOn() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setShown(false), animated ? PEEL_MS : 0);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open && !shown) return null;

  const close = () => {
    onOpenChange(false);
    document.querySelector<HTMLElement>(`[aria-controls="${STICKY_NOTES_ID}"]`)?.focus();
  };

  return (
    <aside id={STICKY_NOTES_ID} className={`sticky-note${open ? '' : ' is-closing'}`} aria-labelledby="sticky-notes-title" inert={!open}>
      <header className="sticky-bar">
        <h2 id="sticky-notes-title" className="sticky-title">
          Sticky notes
        </h2>
        <button type="button" className="sticky-close" onClick={close} aria-label="Close sticky notes">
          <X size={14} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </header>
      <div className="sticky-tabs">
        <div className="segmented" role="group" aria-label="Which note">
          <button type="button" className="segmented-option" aria-pressed={tab === 'card'} onClick={() => setTab('card')}>
            This card
          </button>
          <button type="button" className="segmented-option" aria-pressed={tab === 'deck'} onClick={() => setTab('deck')}>
            Deck note
          </button>
        </div>
      </div>
      <label className="visually-hidden" htmlFor="sticky-notes-text">
        {tab === 'card' ? 'Note for this card' : 'Note for this deck'}
      </label>
      <textarea
        id="sticky-notes-text"
        className="sticky-paper"
        value={tab === 'card' ? cardNote : deckNote}
        placeholder={tab === 'card' ? 'write your own hints!' : 'What tripped you up, and how to remember it next time…'}
        onChange={(e) => (tab === 'card' ? setCardNote(cardId, e.target.value) : setDeckNote(scope, e.target.value))}
      />
    </aside>
  );
}
