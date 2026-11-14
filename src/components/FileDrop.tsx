import { useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, FileUp, ImageIcon, TriangleAlert } from 'lucide-react';
import { ACCEPTED_EXTENSIONS, extensionOf } from '../lib/extract';
import { setPendingFiles } from '../lib/pendingFiles';
import { Dialog } from './Dialog';
import './FileDrop.css';

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
export const STUDIO_ACCEPT = [...ACCEPTED_EXTENSIONS, ...IMAGE_EXT].map((e) => `.${e}`).join(',');

export const isImageFile = (f: File) => f.type.startsWith('image/') || IMAGE_EXT.has(extensionOf(f.name));
const canOpen = (f: File) => isImageFile(f) || ACCEPTED_EXTENSIONS.includes(extensionOf(f.name));

const sizeFmt = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

interface Props {
  /** Open in the studio with this deck preselected. */
  deckId?: string;
  /** When given, confirmed files are handed here instead of navigating to the studio. */
  onOpen?: (files: File[]) => void;
  size?: 'large' | 'compact';
}

/** Drop or choose files, confirm, then open them in the card studio. Nothing is read until confirmed. */
export function FileDrop({ deckId, onOpen, size = 'large' }: Props) {
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [asking, setAsking] = useState<File[] | null>(null);

  const offer = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) setAsking(files);
  };

  const openable = asking?.filter(canOpen) ?? [];
  const blocked = asking?.filter((f) => !canOpen(f)) ?? [];

  function confirm() {
    if (!openable.length) return;
    setAsking(null);
    if (onOpen) onOpen(openable);
    else {
      setPendingFiles(openable);
      navigate(deckId ? `/studio?deck=${deckId}` : '/studio');
    }
  }

  return (
    <>
      <label
        className={`filedrop is-${size}${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          offer(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          multiple
          accept={STUDIO_ACCEPT}
          className="visually-hidden"
          onChange={(e) => {
            offer(e.target.files);
            e.target.value = '';
          }}
        />
        <FileUp size={size === 'large' ? 26 : 20} strokeWidth={1.5} aria-hidden="true" />
        <span className="filedrop-title">{dragging ? 'Let go to open these files' : 'Drop a file here, or choose one'}</span>
        <span className="filedrop-hint">
          Lecture notes, slides, a reading or a diagram. It opens beside the card maker so you can highlight what
          matters and turn it into cards. PDF, Word, PowerPoint, OpenDocument, Markdown, text, CSV, HTML and images.
        </span>
      </label>

      <Dialog open={asking !== null} onClose={() => setAsking(null)} title={openable.length > 1 ? `Open ${openable.length} files?` : 'Open this file?'}>
        <ul className="filedrop-list">
          {asking?.map((f) => (
            <li key={`${f.name}-${f.size}`} className={canOpen(f) ? undefined : 'is-blocked'}>
              {canOpen(f) ? isImageFile(f) ? <ImageIcon size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" /> : <TriangleAlert size={18} aria-hidden="true" />}
              <span className="filedrop-name">{f.name}</span>
              <span className="filedrop-size">{canOpen(f) ? sizeFmt(f.size) : 'can’t be opened'}</span>
            </li>
          ))}
        </ul>
        <p className="muted">
          {blocked.length > 0 && `${blocked.length === 1 ? 'One file is' : `${blocked.length} files are`} in a format Capi’s Deck can’t read and will be skipped. `}
          The file is read on this device and isn’t uploaded anywhere.
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => setAsking(null)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={!openable.length} autoFocus>
            {onOpen ? 'Open' : 'Open in card studio'}
          </button>
        </div>
      </Dialog>
    </>
  );
}
