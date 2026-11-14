import { useEffect } from 'react';
import { X } from 'lucide-react';
import { closePopup, usePopup } from '../lib/popup';
import './PopupHost.css';

export function PopupHost() {
  const popup = usePopup();

  useEffect(() => {
    if (!popup) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closePopup();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [popup]);

  return (
    <div className="popup-region" role="status" aria-live="polite">
      {popup && (
        <div key={popup.id} className={`popup is-${popup.tone}`}>
          <p className="popup-text">{popup.text}</p>
          <button type="button" className="popup-close" onClick={closePopup} aria-label="Close message">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
