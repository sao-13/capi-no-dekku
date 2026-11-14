import { X } from 'lucide-react';
import { dismissToast, useToasts } from '../lib/toast';

export function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast${toast.tone === 'error' ? ' is-error' : ''}`}>
          <span className="toast-message">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                toast.action?.onClick();
                dismissToast(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
