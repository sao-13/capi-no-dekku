import { forwardRef, useImperativeHandle, useRef, type KeyboardEvent } from 'react';
import { Bold, Brackets, Highlighter, Italic, Sigma, Underline, type LucideIcon } from 'lucide-react';
import { clozeAllRevealed, hasMarkup, nextClozeNumber } from '../lib/markup';
import { RichText } from './RichText';

interface Props {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  rows?: number;
  cloze?: boolean;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  serif?: boolean;
}

export interface FormatFieldHandle {
  focus: () => void;
  /** Insert text at the cursor (or append when the field isn't focused). */
  insert: (text: string) => void;
}

type Action = { icon: LucideIcon; label: string; keys: string; before: string; after: string; placeholder: string };

const ACTIONS: Action[] = [
  { icon: Bold, label: 'Bold', keys: 'Ctrl+B', before: '**', after: '**', placeholder: 'bold' },
  { icon: Italic, label: 'Italic', keys: 'Ctrl+I', before: '*', after: '*', placeholder: 'italic' },
  { icon: Underline, label: 'Underline', keys: 'Ctrl+U', before: '__', after: '__', placeholder: 'underlined' },
  { icon: Highlighter, label: 'Highlight', keys: 'Ctrl+Shift+H', before: '==', after: '==', placeholder: 'highlighted' },
  { icon: Sigma, label: 'Math (LaTeX)', keys: 'Ctrl+M', before: '$', after: '$', placeholder: 'x^2' },
];

/** A textarea with a formatting toolbar and a live preview of the markup. */
export const FormatField = forwardRef<FormatFieldHandle, Props>(function FormatField(
  { id, label, hint, value, onChange, onSubmit, placeholder, rows = 3, cloze = false, invalid, describedBy, autoFocus, serif },
  ref,
) {
  const area = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.focus(),
    insert: (text: string) => {
      const el = area.current;
      const focused = el && document.activeElement === el;
      const start = focused ? el.selectionStart : value.length;
      const end = focused ? el.selectionEnd : value.length;
      const before = value.slice(0, start);
      const joiner = !focused && before && !/\s$/.test(before) ? ' ' : '';
      onChange(before + joiner + text + value.slice(end));
    },
  }));

  function wrap(before: string, after: string, fallback: string) {
    const el = area.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const selected = value.slice(s, e) || fallback;
    onChange(value.slice(0, s) + before + selected + after + value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  }

  function addCloze(sameNumber = false) {
    const n = sameNumber ? Math.max(1, nextClozeNumber(value) - 1) : nextClozeNumber(value);
    wrap(`{{c${n}::`, '}}', 'hidden text');
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'enter') {
      e.preventDefault();
      onSubmit?.();
    } else if (k === 'b' && !e.shiftKey) {
      e.preventDefault();
      wrap('**', '**', 'bold');
    } else if (k === 'i' && !e.shiftKey) {
      e.preventDefault();
      wrap('*', '*', 'italic');
    } else if (k === 'u' && !e.shiftKey) {
      e.preventDefault();
      wrap('__', '__', 'underlined');
    } else if (k === 'h' && e.shiftKey) {
      e.preventDefault();
      wrap('==', '==', 'highlighted');
    } else if (k === 'm' && !e.shiftKey) {
      e.preventDefault();
      wrap('$', '$', 'x^2');
    } else if (k === 'c' && e.shiftKey && cloze) {
      e.preventDefault();
      addCloze(e.altKey);
    }
  }

  const preview = hasMarkup(value);

  return (
    <div className="field fmt-field">
      <div className="fmt-head">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <div className="fmt-toolbar" role="toolbar" aria-label={`Format ${label.toLowerCase()}`}>
          {ACTIONS.map(({ icon: Icon, label: name, keys, before, after, placeholder: ph }) => (
            <button
              key={name}
              type="button"
              className="fmt-btn"
              title={`${name} (${keys})`}
              aria-label={name}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => wrap(before, after, ph)}
            >
              <Icon size={15} aria-hidden="true" />
            </button>
          ))}
          {cloze && (
            <button
              type="button"
              className="fmt-btn fmt-cloze"
              title="Hide the selected text as a cloze (Ctrl+Shift+C). Ctrl+Shift+Alt+C reuses the last number."
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addCloze()}
            >
              <Brackets size={15} aria-hidden="true" />
              Cloze
            </button>
          )}
        </div>
      </div>
      <textarea
        id={id}
        ref={area}
        className={`textarea${serif ? ' fmt-serif' : ''}`}
        rows={rows}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={[describedBy, hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {preview && (
        <div className="fmt-preview" aria-label={`${label} preview`}>
          <RichText text={cloze ? clozeAllRevealed(value) : value} />
        </div>
      )}
    </div>
  );
});
