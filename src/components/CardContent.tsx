import { clozeAllRevealed, clozeQuestion, clozeRevealed } from '../lib/markup';
import { typeOf } from '../lib/srs';
import type { Card } from '../lib/types';
import { OcclusionView } from './OcclusionView';
import { RichText } from './RichText';

/** The question and answer for one way of asking a card. */
export function faces(card: Card, variant: string): { question: string; answer: string; extra: string } {
  switch (typeOf(card)) {
    case 'reversed':
      return variant === 'rev'
        ? { question: card.back, answer: card.front, extra: '' }
        : { question: card.front, answer: card.back, extra: '' };
    case 'cloze': {
      const n = Number(variant.slice(1)) || 1;
      return { question: clozeQuestion(card.front, n), answer: clozeRevealed(card.front, n), extra: card.back };
    }
    case 'occlusion':
      return { question: card.front, answer: card.front, extra: card.back };
    default:
      return { question: card.front, answer: card.back, extra: '' };
  }
}

/** Compact two-column summary of a card for lists. */
export function CardSummary({ card }: { card: Card }) {
  const type = typeOf(card);
  if (type === 'occlusion' && card.occlusion) {
    return (
      <>
        <div className="card-front">
          <OcclusionView occlusion={card.occlusion} className="occl-thumb" />
        </div>
        <div className="card-back">
          {card.front && <RichText text={card.front} as="p" />}
          <p className="muted">
            {card.occlusion.masks.length} hidden {card.occlusion.masks.length === 1 ? 'area' : 'areas'},{' '}
            {card.occlusion.mode === 'hide-all' ? 'hide all, guess one' : 'hide one, guess one'}
          </p>
        </div>
      </>
    );
  }
  if (type === 'mcq') {
    return (
      <>
        <RichText text={card.front} as="p" className="card-front" />
        <div className="card-back mcq-summary">
          <p className="mcq-right">
            <span className="visually-hidden">Correct: </span>
            <RichText text={card.back} />
          </p>
          {(card.wrong ?? []).map((w, i) => (
            <p key={i} className="mcq-wrong-item">
              <span className="visually-hidden">Wrong: </span>
              <RichText text={w} />
            </p>
          ))}
        </div>
      </>
    );
  }
  if (type === 'cloze') {
    return (
      <>
        <RichText text={clozeAllRevealed(card.front)} as="p" className="card-front" />
        <RichText text={card.back} as="p" className="card-back" />
      </>
    );
  }
  return (
    <>
      <RichText text={card.front} as="p" className="card-front" />
      <RichText text={card.back} as="p" className="card-back" />
    </>
  );
}
