import { useEffect, useState } from 'react';
import { NotebookPen, Plus, X } from 'lucide-react';
import './Notebook.css';

const OPEN_KEY = 'margin:notebook:open';
const noteKey = (scope: string) => `margin:notebook:${scope}`;

function read(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Kept for this visit only.
  }
}

export function useNotebookOpen() {
  const [open, setOpen] = useState(() => read(OPEN_KEY, 'false') === 'true');
  const set = (next: boolean) => {
    setOpen(next);
    write(OPEN_KEY, String(next));
  };
  return [open, set] as const;
}

interface Props {
  /** Notes are kept per deck ('all' for mixed review). */
  scope: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The card on screen, so it can be copied into the notes. */
  current?: { question: string; answer: string };
}

/** A side column for writing down mistakes while studying. Closed, it's a slim tab. */
export function Notebook({ scope, open, onOpenChange, current }: Props) {
  const [text, setText] = useState(() => read(noteKey(scope), ''));

  useEffect(() => setText(read(noteKey(scope), '')), [scope]);
  useEffect(() => {
    const t = window.setTimeout(() => write(noteKey(scope), text), 300);
    return () => window.clearTimeout(t);
  }, [text, scope]);

  if (!open) {
    return (
      <button type="button" className="notebook-tab" onClick={() => onOpenChange(true)} aria-expanded={false} aria-controls="review-notebook">
        <NotebookPen size={16} aria-hidden="true" />
        <span>Review notebook</span>
      </button>
    );
  }

  return (
    <aside id="review-notebook" className="notebook" aria-labelledby="notebook-title">
      <header className="notebook-head">
        <h2 id="notebook-title">Review notebook</h2>
        <button type="button" className="icon-btn" onClick={() => onOpenChange(false)} aria-label="Close the notebook" aria-expanded>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <p className="notebook-tip">note: it's best practice to write your mistakes!</p>
      <label className="visually-hidden" htmlFor="notebook-text">
        Your notes
      </label>
      <textarea
        id="notebook-text"
        className="notebook-paper"
        value={text}
        placeholder="What tripped you up, and how to remember it next time…"
        onChange={(e) => setText(e.target.value)}
      />
      {current && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setText((t) => `${t}${t && !t.endsWith('\n') ? '\n' : ''}• ${current.question} → ${current.answer}\n`)}
        >
          <Plus size={14} aria-hidden="true" />
          Copy this card into my notes
        </button>
      )}
      <p className="field-hint">Saved in this browser, one notebook per deck.</p>
    </aside>
  );
}
