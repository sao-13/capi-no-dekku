import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional id of an element inside the dialog to describe it. */
  describedBy?: string;
}

/** Native <dialog> with modal focus trapping, Escape to close, and focus returned to the opener. */
export function Dialog({ open, onClose, title, children, describedBy }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Clicking the backdrop (the dialog element itself, outside the body) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="dialog-body">
          <h2 id={titleId} className="dialog-title">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel = 'Keep it', onConfirm, onClose }: ConfirmProps) {
  const bodyId = useId();
  return (
    <Dialog open={open} onClose={onClose} title={title} describedBy={bodyId}>
      <p id={bodyId} className="muted">
        {body}
      </p>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose} autoFocus>
          {cancelLabel}
        </button>
        <button type="button" className="btn btn-danger btn-solid" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
