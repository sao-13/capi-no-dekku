import { CircleAlert, X } from 'lucide-react';
import { dismissLoadNotice, retrySave, useStore } from '../lib/store';

/** Persistent, plain-spoken notices for storage problems. */
export function StorageNotice() {
  const { saveError, loadNotice } = useStore();

  return (
    <>
      {loadNotice?.kind === 'recovered' && (
        <div className="notice is-error" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <p className="notice-title">Your saved decks couldn't be read, so Capi’s Deck started fresh.</p>
            <p className="muted">
              The unreadable data was kept in this browser under the key <code>{loadNotice.backupKey}</code> in case you
              need it.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={dismissLoadNotice} aria-label="Dismiss">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {saveError === 'quota' && (
        <div className="notice is-error" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <p className="notice-title">Your latest changes aren't saved. This browser's storage for Capi’s Deck is full.</p>
            <p className="muted">Delete a deck you no longer need, then save again. Until then, changes last only until you close this tab.</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={retrySave}>
            Save again
          </button>
        </div>
      )}
      {saveError === 'unavailable' && (
        <div className="notice is-error" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <div>
            <p className="notice-title">This browser is blocking storage, so nothing will be kept after you close the tab.</p>
            <p className="muted">Private windows and strict cookie settings do this. Open Capi’s Deck in a regular window to keep your decks.</p>
          </div>
        </div>
      )}
    </>
  );
}
