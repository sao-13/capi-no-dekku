import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Maximize2, Minus, Plus, TriangleAlert } from 'lucide-react';
import './DocViewer.css';

/** How the studio shows a file: as the real thing where the browser can (PDF, Word, images), otherwise as its text. */
export type ViewKind = 'pdf' | 'docx' | 'image' | 'text';

export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const CSS_UNITS = 96 / 72; // PDF points to CSS pixels, so 100% matches the printed size

export function nextZoom(z: number, dir: 1 | -1) {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? ZOOM_STEPS[0];
}

export function ZoomBar({ zoom, onZoom, onFit, extra }: { zoom: number; onZoom: (z: number) => void; onFit?: () => void; extra?: ReactNode }) {
  return (
    <div className="zoom-bar" role="toolbar" aria-label="Zoom">
      <button type="button" className="icon-btn" onClick={() => onZoom(nextZoom(zoom, -1))} aria-label="Zoom out" title="Zoom out" disabled={zoom <= ZOOM_STEPS[0]}>
        <Minus size={16} aria-hidden="true" />
      </button>
      <button type="button" className="zoom-level" onClick={() => onZoom(1)} title="Reset to 100%">
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => onZoom(nextZoom(zoom, 1))}
        aria-label="Zoom in"
        title="Zoom in"
        disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
      {onFit && (
        <button type="button" className="btn btn-sm btn-quiet" onClick={onFit}>
          <Maximize2 size={14} aria-hidden="true" />
          Fit width
        </button>
      )}
      {extra && <span className="zoom-extra">{extra}</span>}
    </div>
  );
}

function ViewError({ children }: { children: ReactNode }) {
  return (
    <div className="notice is-error" role="alert">
      <TriangleAlert size={18} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

/* PDF: each page drawn on a canvas, with pdf.js's invisible text layer on top so text can be selected. */

type PdfModule = typeof import('pdfjs-dist');
type PdfDoc = Awaited<ReturnType<PdfModule['getDocument']>['promise']>;

export function PdfView({
  file,
  zoom,
  rootRef,
  onReady,
}: {
  file: File;
  zoom: number;
  rootRef: RefObject<HTMLDivElement | null>;
  /** Width of page 1 at 100%, for "fit width", and the page count. */
  onReady: (info: { pageWidth: number; pages: number }) => void;
}) {
  const [state, setState] = useState<{ lib: PdfModule; doc: PdfDoc } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    (async () => {
      try {
        const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
        lib.GlobalWorkerOptions.workerSrc = worker.default;
        const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        destroy = () => task.destroy();
        const doc = await task.promise;
        if (cancelled) return;
        const first = await doc.getPage(1);
        onReady({ pageWidth: first.getViewport({ scale: CSS_UNITS }).width, pages: doc.numPages });
        setState({ lib, doc });
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        setError(
          name === 'PasswordException'
            ? 'This PDF is password-protected. Remove the password and open it again.'
            : 'This PDF couldn’t be opened. It may be damaged.',
        );
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
    // onReady is a setter from the parent; reloading on its identity would re-open the file.
  }, [file]);

  if (error) return <ViewError>{error}</ViewError>;
  if (!state)
    return (
      <div className="view-loading" role="status">
        <span className="spinner" aria-hidden="true" /> Opening the PDF…
      </div>
    );

  return (
    <div className="pdf-pages" ref={rootRef}>
      {Array.from({ length: state.doc.numPages }, (_, i) => (
        <PdfPage key={i} lib={state.lib} doc={state.doc} n={i + 1} zoom={zoom} />
      ))}
    </div>
  );
}

function PdfPage({ lib, doc, n, zoom }: { lib: PdfModule; doc: PdfDoc; n: number; zoom: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);
  const [visible, setVisible] = useState(n <= 2);

  useEffect(() => {
    doc.getPage(n).then((p) => {
      const vp = p.getViewport({ scale: 1 });
      setBase({ w: vp.width, h: vp.height });
    });
  }, [doc, n]);

  // Only draw pages near the screen.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !base) return;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    let textLayer: { cancel: () => void } | null = null;
    doc.getPage(n).then((page) => {
      if (cancelled || !canvasRef.current || !textRef.current) return;
      const scale = zoom * CSS_UNITS;
      const dpr = window.devicePixelRatio || 1;
      const vp = page.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      const task = page.render({
        canvas,
        canvasContext: canvas.getContext('2d')!,
        viewport: vp,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      renderTask = task;
      task.promise.catch(() => {});
      const container = textRef.current;
      container.replaceChildren();
      container.style.setProperty('--total-scale-factor', String(scale));
      container.style.setProperty('--scale-factor', String(scale));
      const tl = new lib.TextLayer({ textContentSource: page.streamTextContent(), container, viewport: vp });
      textLayer = tl;
      tl.render().catch(() => {});
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [visible, base, zoom, doc, n, lib]);

  const scale = zoom * CSS_UNITS;
  return (
    <div
      ref={boxRef}
      className="pdf-page"
      style={base ? { width: base.w * scale, height: base.h * scale } : { width: 612 * scale, height: 792 * scale }}
      aria-label={`Page ${n}`}
    >
      <canvas ref={canvasRef} style={base ? { width: base.w * scale, height: base.h * scale } : undefined} aria-hidden="true" />
      <div ref={textRef} className="textLayer" />
    </div>
  );
}

/* Word: rendered as the document itself by docx-preview, then scaled. */

export function DocxView({
  file,
  zoom,
  rootRef,
  onFail,
  onPageWidth,
}: {
  file: File;
  zoom: number;
  rootRef: RefObject<HTMLDivElement | null>;
  onFail?: () => void;
  /** Width of the first page at 100%, for "fit width". */
  onPageWidth?: (w: number) => void;
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let cancelled = false;
    setStatus('loading');
    el.replaceChildren();
    import('docx-preview')
      .then(({ renderAsync }) =>
        renderAsync(file, el, undefined, { className: 'docx', inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, experimental: true }),
      )
      .then(() => {
        if (cancelled) return;
        setStatus('ready');
        const page = el.querySelector<HTMLElement>('section.docx');
        if (page) onPageWidth?.(page.offsetWidth + 32);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
        onFail?.();
      });
    return () => {
      cancelled = true;
    };
    // onFail is a callback from the parent; re-rendering the file when it changes identity isn't wanted.
  }, [file, rootRef]);

  return (
    <>
      {status === 'loading' && (
        <div className="view-loading" role="status">
          <span className="spinner" aria-hidden="true" /> Opening the document…
        </div>
      )}
      {status === 'error' && <ViewError>This Word file couldn’t be shown. It may be damaged, or an older .doc saved with a .docx name.</ViewError>}
      <div className="docx-view" ref={rootRef} style={{ zoom }} />
    </>
  );
}

/* Images */

export function ImageView({ url, alt, zoom, onNatural }: { url: string; alt: string; zoom: number; onNatural: (w: number) => void }) {
  const [w, setW] = useState<number | null>(null);
  return (
    <div className="image-view">
      <img
        src={url}
        alt={alt}
        style={w ? { width: w * zoom } : undefined}
        onLoad={(e) => {
          setW(e.currentTarget.naturalWidth);
          onNatural(e.currentTarget.naturalWidth);
        }}
      />
    </div>
  );
}
