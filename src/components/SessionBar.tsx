import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Infinity as InfinityIcon, StickyNote, X } from 'lucide-react';
import { STICKY_NOTES_ID } from './StickyNotes';
import './SessionBar.css';

interface Props {
  backTo: string;
  /** Accessible name for the close button, e.g. "End session, back to Biology". */
  backLabel: string;
  title: string;
  progress: { value: number; max: number; label: string };
  /** "8 cards left" or "Question 3 of 10". */
  left: ReactNode;
  /** EXP earned this session, and the latest gain for the floating "+EXP". */
  earned: number;
  gain: { id: number; amount: number } | null;
  notes: { open: boolean; hasNote: boolean; onToggle: () => void };
}

/** The study and quiz top bar: close, deck name, sticky notes, progress, and a small stats pill. */
export function SessionBar({ backTo, backLabel, title, progress, left, earned, gain, notes }: Props) {
  return (
    <div className="session-bar">
      <div className="session-bar-top">
        <div className="session-bar-row">
          <Link to={backTo} className="icon-btn session-close" aria-label={backLabel}>
            <X size={20} aria-hidden="true" />
          </Link>
          <p className="session-title">{title}</p>
          <button
            type="button"
            className="btn btn-quiet session-notes-btn"
            aria-expanded={notes.open}
            aria-controls={STICKY_NOTES_ID}
            onClick={notes.onToggle}
          >
            <span className="session-notes-icon">
              <StickyNote size={18} aria-hidden="true" />
              {notes.hasNote && <span className="session-notes-dot" aria-hidden="true" />}
            </span>
            <span className="session-notes-label">Sticky notes</span>
            {notes.hasNote && <span className="visually-hidden">This card has a note</span>}
          </button>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label={progress.label}
          aria-valuemin={0}
          aria-valuemax={progress.max}
          aria-valuenow={progress.value}
        >
          <div className="progress-fill" style={{ width: `${progress.max ? (progress.value / progress.max) * 100 : 0}%` }} />
        </div>
      </div>

      <p className="session-pill">
        <span className="hearts" title="Hearts never run out">
          <Heart size={16} aria-hidden="true" />
          <InfinityIcon size={16} aria-hidden="true" />
          <span className="visually-hidden">Unlimited hearts</span>
        </span>{' '}
        <span className="session-exp">
          +{earned} EXP
          {gain && (
            <span key={gain.id} className="xp-float" aria-hidden="true">
              +{gain.amount} EXP
            </span>
          )}
        </span>{' '}
        <span className="session-left">{left}</span>
      </p>
    </div>
  );
}
