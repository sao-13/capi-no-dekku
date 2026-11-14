import { useState, type FormEvent } from 'react';
import { Dialog } from './Dialog';

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: { name: string; description: string };
  onSubmit: (values: { name: string; description: string }) => void;
  onClose: () => void;
}

const NAME_MAX = 80;
const DESCRIPTION_MAX = 240;

export function DeckFormDialog({ open, mode, initial, onSubmit, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title={mode === 'create' ? 'New deck' : 'Edit deck details'}>
      {/* Remount the form each time it opens so it starts from the current values. */}
      {open && <DeckForm mode={mode} initial={initial} onSubmit={onSubmit} onClose={onClose} />}
    </Dialog>
  );
}

function DeckForm({ mode, initial, onSubmit, onClose }: Omit<Props, 'open'>) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give the deck a name so you can find it later.');
      return;
    }
    onSubmit({ name, description });
  }

  return (
    <form className="dialog-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label className="field-label" htmlFor="deck-name">
          Name
        </label>
        <input
          id="deck-name"
          className="input"
          value={name}
          maxLength={NAME_MAX}
          autoFocus
          autoComplete="off"
          placeholder="For example, Organic chemistry: reactions"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'deck-name-error' : undefined}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
        />
        {error && (
          <p id="deck-name-error" className="field-error">
            {error}
          </p>
        )}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="deck-description">
          What it covers <span className="muted">(optional)</span>
        </label>
        <textarea
          id="deck-description"
          className="textarea"
          rows={3}
          value={description}
          maxLength={DESCRIPTION_MAX}
          placeholder="Which course, chapter or exam it's for"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {mode === 'create' ? 'Create deck' : 'Save details'}
        </button>
      </div>
    </form>
  );
}
