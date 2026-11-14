import { useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { ImagePlus, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { imageDraftFrom, type CardDraft } from '../lib/draft';
import { useImageUrl } from '../lib/images';
import { uid } from '../lib/store';
import type { Mask } from '../lib/types';
import './Occlusion.css';

interface Props {
  draft: CardDraft;
  onChange: (draft: CardDraft) => void;
  idPrefix: string;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Pick an image, then drag boxes over the parts to hide. Each box becomes its own review item. */
export function OcclusionEditor({ draft, onChange, idPrefix }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const stored = useImageUrl(draft.image?.url ? undefined : draft.image?.imageId);
  const url = draft.image?.url ?? (stored === 'missing' ? null : stored);

  async function takeFile(file: File | Blob | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('That file isn’t an image. Use a PNG, JPEG, WebP or GIF.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const image = await imageDraftFrom(file);
      onChange({ ...draft, image, masks: [] });
    } catch {
      setError('This image couldn’t be opened. Try saving it as PNG or JPEG first.');
    } finally {
      setLoading(false);
    }
  }

  const point = (e: PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).classList.contains('occl-mask')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    setDrawing({ x0: p.x, y0: p.y, x: p.x, y: p.y });
    setSelected(null);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drawing) return;
    const p = point(e);
    setDrawing({ ...drawing, x: p.x, y: p.y });
  }

  function onPointerUp() {
    if (!drawing) return;
    const mask: Mask = {
      id: uid(),
      x: Math.min(drawing.x0, drawing.x),
      y: Math.min(drawing.y0, drawing.y),
      w: Math.abs(drawing.x - drawing.x0),
      h: Math.abs(drawing.y - drawing.y0),
    };
    setDrawing(null);
    if (mask.w < 0.015 || mask.h < 0.015) return;
    onChange({ ...draft, masks: [...draft.masks, mask] });
    setSelected(mask.id);
  }

  const removeMask = (id: string) => {
    onChange({ ...draft, masks: draft.masks.filter((m) => m.id !== id) });
    setSelected(null);
  };

  const addMask = () => {
    const mask: Mask = { id: uid(), x: 0.4, y: 0.4, w: 0.2, h: 0.12 };
    onChange({ ...draft, masks: [...draft.masks, mask] });
    setSelected(mask.id);
    canvasRef.current?.focus();
  };

  // Keyboard: arrows move the selected box, Shift+arrows resize it, Delete removes it.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!selected) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeMask(selected);
      return;
    }
    const step = 0.01;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!(e.key in d)) return;
    e.preventDefault();
    const [dx, dy] = d[e.key];
    onChange({
      ...draft,
      masks: draft.masks.map((m) =>
        m.id !== selected
          ? m
          : e.shiftKey
            ? { ...m, w: Math.max(0.02, Math.min(1 - m.x, m.w + dx)), h: Math.max(0.02, Math.min(1 - m.y, m.h + dy)) }
            : { ...m, x: clamp(Math.min(1 - m.w, m.x + dx)), y: clamp(Math.min(1 - m.h, m.y + dy)) },
      ),
    });
  }

  if (!draft.image) {
    return (
      <div className="occl-editor">
        <label
          className={`occl-pick${dragging ? ' is-dragging' : ''}`}
          onDragOver={(e: DragEvent) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setDragging(false);
            takeFile(e.dataTransfer.files[0]);
          }}
          onPaste={(e) => takeFile([...e.clipboardData.files].find((f) => f.type.startsWith('image/')))}
        >
          <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => takeFile(e.target.files?.[0])} />
          <ImagePlus size={22} aria-hidden="true" />
          <strong>{loading ? 'Opening image…' : 'Choose an image, drop one here, or paste it'}</strong>
          A diagram, map or labelled figure works best. You’ll draw boxes over the labels to hide them.
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const live = drawing && {
    x: Math.min(drawing.x0, drawing.x),
    y: Math.min(drawing.y0, drawing.y),
    w: Math.abs(drawing.x - drawing.x0),
    h: Math.abs(drawing.y - drawing.y0),
  };

  return (
    <div className="occl-editor">
      <div className="occl-toolbar">
        <span id={`${idPrefix}-occl-help`}>
          Drag over each part to hide. {draft.masks.length ? `${draft.masks.length} hidden.` : ''}
        </span>
        <div className="btn-row">
          <button type="button" className="btn btn-sm" onClick={addMask}>
            <Plus size={14} aria-hidden="true" />
            Add box
          </button>
          <label className="btn btn-sm">
            <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => takeFile(e.target.files?.[0])} />
            <RefreshCw size={14} aria-hidden="true" />
            Change image
          </label>
        </div>
      </div>
      <div
        ref={canvasRef}
        className="occl-canvas"
        tabIndex={0}
        role="application"
        aria-label="Image with hidden areas. Select a box, then use arrow keys to move it, Shift and arrows to resize, Delete to remove."
        aria-describedby={`${idPrefix}-occl-help`}
        style={{ aspectRatio: `${draft.image.width} / ${draft.image.height}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrawing(null)}
        onKeyDown={onKeyDown}
      >
        {url ? <img src={url} alt="" /> : <div className="occl-loading skeleton" />}
        {draft.masks.map((m, i) => (
          <span
            key={m.id}
            className={`occl-mask${selected === m.id ? ' is-selected' : ''}`}
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSelected(m.id);
            }}
          >
            <span className="occl-mask-label">{i + 1}</span>
          </span>
        ))}
        {live && <span className="occl-mask is-drawing" style={{ left: `${live.x * 100}%`, top: `${live.y * 100}%`, width: `${live.w * 100}%`, height: `${live.h * 100}%` }} />}
      </div>
      <div className="occl-toolbar">
        <fieldset className="chip-group">
          <legend className="visually-hidden">When studying</legend>
          {(
            [
              ['hide-one', 'Hide one, guess one'],
              ['hide-all', 'Hide all, guess one'],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode} className="chip">
              <input type="radio" name={`${idPrefix}-mode`} checked={draft.mode === mode} onChange={() => onChange({ ...draft, mode })} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        {selected && (
          <button type="button" className="btn btn-sm btn-quiet btn-danger" onClick={() => removeMask(selected)}>
            <Trash2 size={14} aria-hidden="true" />
            Remove box {draft.masks.findIndex((m) => m.id === selected) + 1}
          </button>
        )}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
