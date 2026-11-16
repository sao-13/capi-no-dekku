import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Brackets, FilePlus, Highlighter, ImagePlus, TriangleAlert, X } from 'lucide-react';
import { CardEditor, type CardEditorHandle } from '../components/CardEditor';
import { CardSummary } from '../components/CardContent';
import { FileDrop, isImageFile, STUDIO_ACCEPT } from '../components/FileDrop';
import { DocxView, ImageView, PdfView, ZoomBar, type ViewKind } from '../components/DocViewer';
import { draftToInput, emptyDraft, imageDraftFrom, nextDraft, validateDraft, type CardDraft } from '../lib/draft';
import { ExtractError, extensionOf, extractText } from '../lib/extract';
import { takePendingFiles } from '../lib/pendingFiles';
import { addCard, createDeck, uid, useData } from '../lib/store';
import { plural } from '../lib/dates';
import { showToast } from '../lib/toast';
import './Studio.css';

/* Document model */

type Block = { type: 'h' | 'li' | 'p' | 'term' | 'def'; text: string; level?: number };
type Span = { block: number; start: number; end: number };

interface Doc {
  id: string;
  name: string;
  /** pdf, docx and image are shown as they are; other formats as their text. */
  kind: ViewKind;
  file: File;
  zoom: number;
  /** Page width at 100% (PDF) or natural width (image), for Fit width. */
  fitWidth?: number;
  pages?: number;
  /** Shown as text because the real view failed. */
  fallback?: boolean;
  status: 'reading' | 'ready' | 'error';
  progress?: string;
  detail?: string;
  error?: string;
  blocks?: Block[];
  image?: { url: string; file: File };
  marks: Span[];
}

/** Turn extracted text ("# heading", "- item", "term<TAB>definition", wrapped lines) into readable blocks. */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ').replace(/\s+/g, ' ').trim() });
    para = [];
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = /^(#{1,6})\s+(.+)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ type: 'h', text: h[2], level: h[1].length });
      continue;
    }
    if (line.includes('\t')) {
      const [a, b] = line.split('\t').map((s) => s.trim());
      if (a && b) {
        flush();
        blocks.push({ type: 'term', text: a }, { type: 'def', text: b });
        continue;
      }
    }
    const li = /^(?:[-*•▪◦]|\d{1,2}[.)])\s+(.+)$/.exec(line);
    if (li) {
      flush();
      blocks.push({ type: 'li', text: li[1] });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

/** Character offset of (node, offset) inside a block's text. */
function offsetIn(block: Element, node: Node, offset: number) {
  const r = document.createRange();
  r.selectNodeContents(block);
  r.setEnd(node, offset);
  return r.toString().length;
}

function spansFor(range: Range, root: HTMLElement): Span[] {
  const spans: Span[] = [];
  root.querySelectorAll<HTMLElement>('[data-block]').forEach((el) => {
    if (!range.intersectsNode(el)) return;
    const len = el.textContent?.length ?? 0;
    const start = el.contains(range.startContainer) ? offsetIn(el, range.startContainer, range.startOffset) : 0;
    const end = el.contains(range.endContainer) ? offsetIn(el, range.endContainer, range.endOffset) : len;
    if (end > start) spans.push({ block: Number(el.dataset.block), start, end });
  });
  return spans;
}

/** Split a block's text into plain and marked runs. */
function runs(text: string, marks: Span[]): { text: string; marked: boolean }[] {
  const sorted = marks.map((m) => [m.start, m.end] as const).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const out: { text: string; marked: boolean }[] = [];
  let at = 0;
  for (const [s, e] of merged) {
    if (s > at) out.push({ text: text.slice(at, s), marked: false });
    out.push({ text: text.slice(s, e), marked: true });
    at = e;
  }
  if (at < text.length) out.push({ text: text.slice(at), marked: false });
  return out;
}

type Side = 'left' | 'right';
const SIDE_KEY = 'margin:studio:cards-side';
const SPLIT_KEY = 'margin:studio:split';
/** Share of the width given to the document pane, in percent. */
const readSplit = () => {
  try {
    const n = Number(localStorage.getItem(SPLIT_KEY));
    return n >= 25 && n <= 75 ? n : 55;
  } catch {
    return 55;
  }
};
const readSide = (): Side => {
  try {
    return localStorage.getItem(SIDE_KEY) === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
};

interface Selection {
  text: string;
  spans: Span[];
  x: number;
  y: number;
  below: boolean;
}

export function Studio() {
  const data = useData();
  const [params] = useSearchParams();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [side, setSide] = useState<Side>(readSide);
  const [split, setSplitState] = useState(readSplit);
  const studioRef = useRef<HTMLDivElement>(null);
  const [mobileView, setMobileView] = useState<'doc' | 'card'>('doc');
  const [selection, setSelection] = useState<Selection | null>(null);

  const [draft, setDraft] = useState<CardDraft>(() => emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deckChoice, setDeckChoice] = useState<string>(() => {
    const preset = params.get('deck');
    if (preset && data.decks.some((d) => d.id === preset)) return preset;
    return [...data.decks].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? 'new';
  });
  const [newDeckName, setNewDeckName] = useState('');
  const [added, setAdded] = useState<string[]>([]);

  const readerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<CardEditorHandle>(null);

  const active = docs.find((d) => d.id === activeId) ?? null;
  const update = (id: string, patch: Partial<Doc>) => setDocs((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const openFiles = useCallback(async (files: File[]) => {
    const kindOf = (file: File): ViewKind => {
      if (isImageFile(file)) return 'image';
      const ext = extensionOf(file.name);
      return ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : 'text';
    };
    const entries: Doc[] = files.map((file) => {
      const kind = kindOf(file);
      return {
        id: uid(),
        name: file.name,
        kind,
        file,
        zoom: 1,
        status: kind === 'text' ? 'reading' : 'ready',
        progress: 'Opening',
        marks: [],
        ...(kind === 'image' && { image: { url: URL.createObjectURL(file), file } }),
      };
    });
    setDocs((list) => [...list, ...entries]);
    setActiveId(entries[0]?.id ?? null);
    setMobileView('doc');
    for (const [i, file] of files.entries()) {
      const entry = entries[i];
      if (entry.kind !== 'text') continue;
      try {
        const { text, detail } = await extractText(file, (progress) => update(entry.id, { progress }));
        update(entry.id, { status: 'ready', blocks: toBlocks(text), detail, progress: undefined });
      } catch (err) {
        update(entry.id, {
          status: 'error',
          error: err instanceof ExtractError ? err.message : 'Something went wrong while reading this file. Try opening it again.',
        });
      }
    }
  }, []);

  // Files confirmed on another page arrive here.
  useEffect(() => {
    const pending = takePendingFiles();
    if (pending.length) openFiles(pending);
  }, [openFiles]);

  // Track text selected inside the document and place the toolbar above it. Re-placed on scroll and resize.
  useEffect(() => {
    const place = () => {
      const sel = document.getSelection();
      const root = readerRef.current;
      if (!sel || sel.isCollapsed || !root || sel.rangeCount === 0) return setSelection(null);
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return setSelection(null);
      const text = sel.toString().trim();
      if (!text) return setSelection(null);
      const rect = range.getBoundingClientRect();
      const pane = root.closest('.studio-pane')?.getBoundingClientRect();
      // Hide the toolbar while the selection is scrolled out of its pane.
      if (pane && (rect.bottom < pane.top || rect.top > pane.bottom)) return setSelection(null);
      const below = rect.top < (pane?.top ?? 0) + 56;
      // Keep the toolbar (about 320px wide) inside the window.
      const x = Math.min(Math.max(rect.left + rect.width / 2, 170), window.innerWidth - 170);
      setSelection({ text, spans: spansFor(range, root), x, y: below ? rect.bottom : rect.top, below });
    };
    document.addEventListener('selectionchange', place);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('selectionchange', place);
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
    };
  }, []);

  // Swapping sides moves the text under the toolbar; re-place it after layout.
  useEffect(() => {
    requestAnimationFrame(() => document.dispatchEvent(new Event('selectionchange')));
  }, [side, mobileView]);

  const send = useCallback(
    (target: 'front' | 'back' | 'cloze' | 'mark') => {
      if (!selection || !active) return;
      update(active.id, { marks: [...active.marks, ...selection.spans] });
      if (target !== 'mark') {
        editorRef.current?.insert(target, selection.text);
        showToast(target === 'cloze' ? 'Added as a hidden part of the cloze text.' : `Added to the ${draft.type === 'cloze' && target === 'front' ? 'text' : target}.`, { duration: 1800 });
      }
      document.getSelection()?.removeAllRanges();
      setSelection(null);
    },
    [selection, active, draft.type],
  );

  // F, B, C, H act on the current selection.
  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select')) return;
      const map: Record<string, 'front' | 'back' | 'cloze' | 'mark'> = { f: 'front', b: 'back', c: 'cloze', h: 'mark' };
      const target = map[e.key.toLowerCase()];
      if (target) {
        e.preventDefault();
        send(target);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selection, send]);

  function closeDoc(id: string) {
    const doc = docs.find((d) => d.id === id);
    if (doc?.image) URL.revokeObjectURL(doc.image.url);
    const rest = docs.filter((d) => d.id !== id);
    setDocs(rest);
    if (activeId === id) setActiveId(rest[0]?.id ?? null);
  }

  const setSplit = (n: number) => {
    const v = Math.round(Math.max(25, Math.min(75, n)));
    setSplitState(v);
    try {
      localStorage.setItem(SPLIT_KEY, String(v));
    } catch {
      // Remembered for this visit only.
    }
  };

  /** Drag the divider: the document pane takes whatever share of the width is on its side of the pointer. */
  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    const box = studioRef.current?.getBoundingClientRect();
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const pct = ((ev.clientX - box.left) / box.width) * 100;
      setSplit(side === 'right' ? pct : 100 - pct);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('is-resizing');
    };
    document.body.classList.add('is-resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function swapSide() {
    const next: Side = side === 'right' ? 'left' : 'right';
    setSide(next);
    try {
      localStorage.setItem(SIDE_KEY, next);
    } catch {
      // Remembered for this visit only.
    }
  }

  async function startOcclusionFrom(file: File) {
    try {
      const image = await imageDraftFrom(file);
      setDraft({ ...emptyDraft('occlusion'), image });
      setError(null);
      setMobileView('card');
    } catch {
      showToast('This image couldn’t be opened for an occlusion card.', { tone: 'error' });
    }
  }

  async function addToDeck() {
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    let deckId = deckChoice;
    if (deckChoice === 'new') {
      const name = newDeckName.trim() || (active ? active.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') : '');
      if (!name) {
        setError('Name the new deck first.');
        document.getElementById('studio-deck-name')?.focus();
        return;
      }
      deckId = createDeck({ name, description: active ? `Made from ${active.name}.` : '' }).id;
      setDeckChoice(deckId);
      setNewDeckName('');
    }
    setSaving(true);
    try {
      const card = addCard(deckId, await draftToInput(draft));
      setAdded((a) => [card.id, ...a]);
      setDraft(nextDraft(draft));
      setError(null);
      editorRef.current?.focus();
    } catch {
      setError('The image couldn’t be saved in this browser. Check that storage isn’t full or blocked.');
    } finally {
      setSaving(false);
    }
  }

  const paneRef = useRef<HTMLDivElement>(null);

  /** When a file can't be shown as it looks, fall back to its text so it can still be used. */
  async function showAsText(doc: Doc) {
    update(doc.id, { kind: 'text', status: 'reading', progress: 'Reading the text instead', zoom: 1, fallback: true });
    try {
      const { text, detail } = await extractText(doc.file);
      update(doc.id, { status: 'ready', blocks: toBlocks(text), detail, progress: undefined });
    } catch (err) {
      update(doc.id, { status: 'error', error: err instanceof ExtractError ? err.message : 'This file couldn’t be read.' });
    }
  }
  const setZoom = (z: number) => active && update(active.id, { zoom: z });
  const fit = () => {
    if (!active?.fitWidth || !paneRef.current) return;
    const room = paneRef.current.clientWidth - 48;
    setZoom(Math.max(0.3, Math.min(3, room / active.fitWidth)));
  };

  const addedCards = useMemo(() => added.map((id) => data.cards.find((c) => c.id === id)).filter((c) => c !== undefined), [added, data.cards]);
  const deckName = data.decks.find((d) => d.id === deckChoice)?.name;

  return (
    <div ref={studioRef} className={`studio cards-${side} show-${mobileView}`} style={{ '--split': split } as React.CSSProperties}>
      <header className="studio-head">
        <h1 className="studio-title">Card studio</h1>
        <div className="segmented studio-switch" role="group" aria-label="Show">
          <button type="button" className="segmented-option" aria-pressed={mobileView === 'doc'} onClick={() => setMobileView('doc')}>
            Document
          </button>
          <button type="button" className="segmented-option" aria-pressed={mobileView === 'card'} onClick={() => setMobileView('card')}>
            Card{added.length ? ` (${added.length})` : ''}
          </button>
        </div>
        <button type="button" className="btn btn-sm studio-swap" onClick={swapSide}>
          <ArrowLeftRight size={14} aria-hidden="true" />
          Cards on the {side === 'right' ? 'left' : 'right'}
        </button>
      </header>

      <section className="studio-pane studio-doc" aria-label="Document">
        {docs.length > 0 && (
          <div className="doc-tabs" role="tablist" aria-label="Open files">
            {docs.map((d) => (
              <div key={d.id} className={`doc-tab${d.id === activeId ? ' is-active' : ''}`}>
                <button type="button" role="tab" aria-selected={d.id === activeId} onClick={() => setActiveId(d.id)} className="doc-tab-name">
                  {d.status === 'error' && <TriangleAlert size={14} aria-hidden="true" />}
                  {d.name}
                </button>
                <button type="button" className="doc-tab-close" aria-label={`Close ${d.name}`} onClick={() => closeDoc(d.id)}>
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
            <label className="doc-tab-add" title="Open another file">
              <input
                type="file"
                multiple
                accept={STUDIO_ACCEPT}
                className="visually-hidden"
                onChange={(e) => {
                  if (e.target.files?.length) openFiles(Array.from(e.target.files));
                  e.target.value = '';
                }}
              />
              <FilePlus size={16} aria-hidden="true" />
              <span className="visually-hidden">Open another file</span>
            </label>
          </div>
        )}

        <div className="doc-body" ref={paneRef}>
          {!active && (
            <div className="doc-empty">
              <FileDrop onOpen={openFiles} />
              <p className="muted">
                No file? You can still write cards <span className="only-wide">on the {side}</span>
                <span className="only-narrow">in the Card tab</span>. Open your notes here to highlight text and send it
                straight to a card.
              </p>
            </div>
          )}

          {active?.status === 'reading' && (
            <div className="doc-loading" role="status">
              <span className="spinner" aria-hidden="true" />
              {active.progress ?? 'Reading'}…
            </div>
          )}

          {active?.status === 'error' && (
            <div className="notice is-error" role="alert">
              <TriangleAlert size={18} aria-hidden="true" />
              <div>
                <p className="notice-title">{active.name} couldn’t be opened.</p>
                <p className="muted">{active.error}</p>
              </div>
            </div>
          )}

          {active && active.status !== 'error' && active.kind !== 'text' && (
            <ZoomBar
              zoom={active.zoom}
              onZoom={setZoom}
              onFit={active.fitWidth ? fit : undefined}
              extra={active.pages ? `${active.pages} ${active.pages === 1 ? 'page' : 'pages'}. Select text to send it to your card.` : undefined}
            />
          )}

          {active?.kind === 'pdf' && (
            <PdfView
              key={active.id}
              file={active.file}
              zoom={active.zoom}
              rootRef={readerRef}
              onReady={({ pageWidth, pages }) => {
                const room = (paneRef.current?.clientWidth ?? 800) - 48;
                update(active.id, { fitWidth: pageWidth, pages, zoom: Math.max(0.3, Math.min(1.5, room / pageWidth)) });
              }}
            />
          )}

          {active?.kind === 'docx' && (
            <DocxView
              key={active.id}
              file={active.file}
              zoom={active.zoom}
              rootRef={readerRef}
              onFail={() => showAsText(active)}
              onPageWidth={(w) => !active.fitWidth && update(active.id, { fitWidth: w })}
            />
          )}

          {active?.kind === 'image' && active.image && (
            <>
              <div className="doc-image-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => startOcclusionFrom(active.image!.file)}>
                  <ImagePlus size={16} aria-hidden="true" />
                  Make an image occlusion card from this
                </button>
              </div>
              <ImageView
                url={active.image.url}
                alt={active.name}
                zoom={active.zoom}
                onNatural={(w) => {
                  if (active.fitWidth) return;
                  const room = (paneRef.current?.clientWidth ?? 800) - 48;
                  update(active.id, { fitWidth: w, zoom: Math.min(1, room / w) });
                }}
              />
            </>
          )}

          {active?.kind === 'text' && active.status === 'ready' && active.blocks && (
            <div className="text-view">
              <ZoomBar zoom={active.zoom} onZoom={setZoom} extra={`${active.detail}. Select text to send it to your card.`} />
              {active.fallback && (
                <p className="doc-note">This file couldn’t be shown as it looks, so here is its text. You can still select and use it.</p>
              )}
              {/\.(pptx|odt)$/i.test(active.name) && (
                <p className="doc-note">
                  PowerPoint and OpenDocument files show their text here, not their layout. To see the slides or pages
                  exactly as designed, save the file as a PDF and open that instead.
                </p>
              )}
              <article className="doc-reader" ref={readerRef} style={{ fontSize: `${1.0625 * active.zoom}rem` }}>
                {renderBlocks(active.blocks, active.marks)}
              </article>
            </div>
          )}
        </div>

        {selection &&
          createPortal(
          <div
            className={`sel-toolbar${selection.below ? ' is-below' : ''}`}
            style={{ left: selection.x, top: selection.y }}
            role="toolbar"
            aria-label="Use selected text"
            onMouseDown={(e) => e.preventDefault()}
          >
            <button type="button" onClick={() => send('front')} title="Send to front (F)">
              {draft.type === 'cloze' ? 'Text' : 'Front'} <kbd>F</kbd>
            </button>
            <button type="button" onClick={() => send('back')} title="Send to back (B)">
              {draft.type === 'basic' || draft.type === 'reversed' ? 'Back' : draft.type === 'mcq' || draft.type === 'typein' ? 'Answer' : 'Extra'} <kbd>B</kbd>
            </button>
            <button type="button" onClick={() => send('cloze')} title="Add as a cloze deletion (C)">
              <Brackets size={14} aria-hidden="true" /> Cloze <kbd>C</kbd>
            </button>
            {active?.kind === 'text' && (
              <button type="button" onClick={() => send('mark')} title="Just highlight it (H)" aria-label="Highlight only">
                <Highlighter size={14} aria-hidden="true" /> <kbd>H</kbd>
              </button>
            )}
          </div>,
          document.body,
        )}
      </section>

      <div
        className="studio-split"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the document and card panes"
        aria-valuemin={25}
        aria-valuemax={75}
        aria-valuenow={split}
        tabIndex={0}
        onPointerDown={startDrag}
        onDoubleClick={() => setSplit(55)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 3;
          if (e.key === 'ArrowLeft') setSplit(split + (side === 'right' ? -step : step));
          else if (e.key === 'ArrowRight') setSplit(split + (side === 'right' ? step : -step));
          else if (e.key === 'Home') setSplit(55);
          else return;
          e.preventDefault();
        }}
        title="Drag to resize. Double-click to reset."
      >
        <span aria-hidden="true" />
      </div>

      <section className="studio-pane studio-cards" aria-labelledby="studio-card-heading">
        <div className="studio-deck">
          <h2 id="studio-card-heading" className="visually-hidden">
            New card
          </h2>
          <div className="field">
            <label className="field-label" htmlFor="studio-deck">
              Add to deck
            </label>
            <select id="studio-deck" className="select" value={deckChoice} onChange={(e) => setDeckChoice(e.target.value)}>
              {data.decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
              <option value="new">A new deck…</option>
            </select>
          </div>
          {deckChoice === 'new' && (
            <div className="field">
              <label className="field-label" htmlFor="studio-deck-name">
                New deck name
              </label>
              <input
                id="studio-deck-name"
                className="input"
                value={newDeckName}
                placeholder={active ? active.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') : 'For example, Biology unit 3'}
                onChange={(e) => setNewDeckName(e.target.value)}
              />
            </div>
          )}
        </div>

        <CardEditor
          ref={editorRef}
          idPrefix="studio"
          value={draft}
          onChange={(d) => {
            setDraft(d);
            if (error) setError(null);
          }}
          onSubmit={addToDeck}
          error={error}
        />

        <div className="studio-add">
          <button type="button" className="btn btn-primary" onClick={addToDeck} disabled={saving}>
            {saving ? 'Saving…' : `Add card${deckName ? ` to ${deckName}` : ''}`}
          </button>
          <span className="field-hint">
            <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
          </span>
        </div>

        {addedCards.length > 0 && (
          <div className="studio-added">
            <div className="section-head">
              <h3>Made this session</h3>
              <span className="section-aside">{plural(addedCards.length, 'card')}</span>
            </div>
            <ul className="card-list">
              {addedCards.slice(0, 20).map((c) => (
                <li key={c.id} className="card-row is-compact">
                  <CardSummary card={c} />
                </li>
              ))}
            </ul>
            {deckChoice !== 'new' && (
              <Link to={`/decks/${deckChoice}`} className="btn btn-sm">
                Open {deckName}
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function renderBlocks(blocks: Block[], marks: Span[]) {
  const out: React.ReactNode[] = [];
  const text = (b: Block, i: number) =>
    runs(
      b.text,
      marks.filter((m) => m.block === i),
    ).map((r, k) => (r.marked ? <mark key={k} className="doc-mark">{r.text}</mark> : r.text));

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'h') {
      const Tag = (b.level ?? 2) <= 1 ? 'h2' : 'h3';
      out.push(
        <Tag key={i} data-block={i} className="doc-h">
          {text(b, i)}
        </Tag>,
      );
    } else if (b.type === 'li') {
      const items: React.ReactNode[] = [];
      while (i < blocks.length && blocks[i].type === 'li') {
        items.push(
          <li key={i} data-block={i}>
            {text(blocks[i], i)}
          </li>,
        );
        i++;
      }
      i--;
      out.push(<ul key={`ul-${i}`}>{items}</ul>);
    } else if (b.type === 'term') {
      const rows: React.ReactNode[] = [];
      while (i + 1 < blocks.length && blocks[i].type === 'term' && blocks[i + 1].type === 'def') {
        rows.push(
          <div key={i} className="doc-pair">
            <dt data-block={i}>{text(blocks[i], i)}</dt>
            <dd data-block={i + 1}>{text(blocks[i + 1], i + 1)}</dd>
          </div>,
        );
        i += 2;
      }
      i--;
      out.push(<dl key={`dl-${i}`}>{rows}</dl>);
    } else {
      out.push(
        <p key={i} data-block={i}>
          {text(b, i)}
        </p>,
      );
    }
  }
  return out;
}
