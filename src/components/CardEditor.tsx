import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { CardDraft } from '../lib/draft';
import type { CardType } from '../lib/types';
import { FormatField, type FormatFieldHandle } from './FormatField';
import { OcclusionEditor } from './OcclusionEditor';
import './CardEditor.css';

const TYPES: { type: CardType; label: string; note: string }[] = [
  { type: 'basic', label: 'Basic', note: 'Front asks, back answers.' },
  { type: 'reversed', label: 'Basic + reversed', note: 'Asked both ways: front to back, and back to front.' },
  { type: 'cloze', label: 'Cloze', note: 'Hide words in a sentence. Each hidden part is asked on its own.' },
  { type: 'occlusion', label: 'Image occlusion', note: 'Hide labels on a picture. Each box is asked on its own.' },
  { type: 'mcq', label: 'Gizmo Style', note: 'Multiple choice: your question, one correct answer and three wrong ones. Choices are shuffled every time.' },
  { type: 'typein', label: 'Type-in', note: 'Type the answer from memory. Small typos are forgiven.' },
];

export interface CardEditorHandle {
  /** Put text into a field: front (or cloze text), back (or extra), or as a new cloze deletion. */
  insert: (target: 'front' | 'back' | 'cloze', text: string) => void;
  focus: () => void;
}

interface Props {
  idPrefix: string;
  value: CardDraft;
  onChange: (draft: CardDraft) => void;
  onSubmit?: () => void;
  error?: string | null;
  autoFocus?: boolean;
}

export const CardEditor = forwardRef<CardEditorHandle, Props>(function CardEditor(
  { idPrefix, value, onChange, onSubmit, error, autoFocus },
  ref,
) {
  const frontRef = useRef<FormatFieldHandle>(null);
  const backRef = useRef<FormatFieldHandle>(null);
  const set = (patch: Partial<CardDraft>) => onChange({ ...value, ...patch });
  const errorId = `${idPrefix}-error`;

  useImperativeHandle(ref, () => ({
    focus: () => frontRef.current?.focus(),
    insert: (target, text) => {
      const clean = text.replace(/\s+/g, ' ').trim();
      if (!clean) return;
      if (target === 'cloze') {
        const n = Math.max(0, ...[...value.front.matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1]))) + 1;
        const front = value.front ? `${value.front.replace(/\s*$/, '')} ` : '';
        onChange({ ...value, type: 'cloze', front: `${front}{{c${n}::${clean}}}` });
        return;
      }
      (target === 'front' ? frontRef : backRef).current?.insert(clean);
    },
  }));

  const current = TYPES.find((t) => t.type === value.type)!;

  return (
    <div className="card-editor">
      <fieldset className="type-picker">
        <legend className="field-label">Card type</legend>
        <div className="chip-group">
          {TYPES.map((t) => (
            <label key={t.type} className="chip">
              <input type="radio" name={`${idPrefix}-type`} checked={value.type === t.type} onChange={() => set({ type: t.type })} />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
        <p className="field-hint">{current.note}</p>
      </fieldset>

      {value.type === 'occlusion' && <OcclusionEditor draft={value} onChange={onChange} idPrefix={idPrefix} />}

      {(value.type === 'basic' || value.type === 'reversed' || value.type === 'typein') && (
        <div className="card-editor-sides">
          <FormatField
            ref={frontRef}
            id={`${idPrefix}-front`}
            label={value.type === 'typein' ? 'Question' : 'Front'}
            value={value.front}
            onChange={(front) => set({ front })}
            onSubmit={onSubmit}
            placeholder="A question, term or prompt"
            invalid={!!error && !value.front.trim()}
            describedBy={error ? errorId : undefined}
            autoFocus={autoFocus}
            serif
          />
          <FormatField
            ref={backRef}
            id={`${idPrefix}-back`}
            label={value.type === 'typein' ? 'Answer' : 'Back'}
            value={value.back}
            onChange={(back) => set({ back })}
            onSubmit={onSubmit}
            placeholder="The answer you want to remember"
            invalid={!!error && !value.back.trim()}
            describedBy={error ? errorId : undefined}
          />
        </div>
      )}

      {value.type === 'cloze' && (
        <div className="card-editor-stack">
          <FormatField
            ref={frontRef}
            id={`${idPrefix}-front`}
            label="Text"
            hint="Select the words to hide and press Cloze. Use the same number twice to hide parts together."
            value={value.front}
            onChange={(front) => set({ front })}
            onSubmit={onSubmit}
            placeholder="The powerhouse of the cell is the mitochondrion."
            invalid={!!error}
            describedBy={error ? errorId : undefined}
            autoFocus={autoFocus}
            cloze
            serif
          />
          <FormatField
            ref={backRef}
            id={`${idPrefix}-back`}
            label="Extra (optional)"
            value={value.back}
            onChange={(back) => set({ back })}
            onSubmit={onSubmit}
            placeholder="Shown after you answer: a source, a mnemonic, a worked example"
            rows={2}
          />
        </div>
      )}

      {value.type === 'mcq' && (
        <div className="card-editor-stack">
          <FormatField
            ref={frontRef}
            id={`${idPrefix}-front`}
            label="Question"
            value={value.front}
            onChange={(front) => set({ front })}
            onSubmit={onSubmit}
            placeholder="What does the mitochondrion make?"
            invalid={!!error && !value.front.trim()}
            describedBy={error ? errorId : undefined}
            autoFocus={autoFocus}
            rows={2}
            serif
          />
          <FormatField
            ref={backRef}
            id={`${idPrefix}-back`}
            label="Correct answer"
            value={value.back}
            onChange={(back) => set({ back })}
            onSubmit={onSubmit}
            placeholder="ATP"
            invalid={!!error && !value.back.trim()}
            describedBy={error ? errorId : undefined}
            rows={1}
          />
          <div className="mcq-wrong">
            {[0, 1, 2].map((i) => (
              <FormatField
                key={i}
                id={`${idPrefix}-wrong-${i}`}
                label={`Wrong answer ${i + 1}`}
                value={value.wrong[i] ?? ''}
                onChange={(w) => set({ wrong: value.wrong.map((x, j) => (j === i ? w : x)) })}
                onSubmit={onSubmit}
                placeholder={['Glucose', 'Oxygen', 'DNA'][i]}
                invalid={!!error && !value.wrong[i]?.trim()}
                rows={1}
              />
            ))}
          </div>
        </div>
      )}

      {value.type === 'occlusion' && (
        <div className="card-editor-sides">
          <FormatField
            ref={frontRef}
            id={`${idPrefix}-front`}
            label="Header (optional)"
            value={value.front}
            onChange={(front) => set({ front })}
            onSubmit={onSubmit}
            placeholder="What the picture shows"
            rows={2}
            serif
          />
          <FormatField
            ref={backRef}
            id={`${idPrefix}-back`}
            label="Extra (optional)"
            value={value.back}
            onChange={(back) => set({ back })}
            onSubmit={onSubmit}
            placeholder="Shown after you answer"
            rows={2}
          />
        </div>
      )}

      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
