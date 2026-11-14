import { ImageOff } from 'lucide-react';
import { useImageUrl } from '../lib/images';
import type { Occlusion } from '../lib/types';
import './Occlusion.css';

interface Props {
  occlusion: Occlusion;
  /** The mask being asked. Omit to show the image with every mask covered (list view). */
  active?: string;
  revealed?: boolean;
  /** Pass a ready URL (editor preview) instead of loading from IndexedDB. */
  src?: string;
  className?: string;
}

/** An image with its masks drawn over it, as seen while studying. */
export function OcclusionView({ occlusion, active, revealed = false, src, className }: Props) {
  const stored = useImageUrl(src ? undefined : occlusion.imageId);
  const url = src ?? stored;

  if (url === 'missing') {
    return (
      <div className="occl-missing">
        <ImageOff size={20} aria-hidden="true" />
        This card's image isn't in this browser. Images stay on the device they were added on.
      </div>
    );
  }

  return (
    <div className={`occl${className ? ` ${className}` : ''}`} style={{ aspectRatio: `${occlusion.width} / ${occlusion.height}` }}>
      {url ? <img src={url} alt="" draggable={false} /> : <div className="occl-loading skeleton" />}
      {occlusion.masks.map((m) => {
        const isActive = m.id === active;
        // hide-one: only the asked mask is covered. hide-all: every mask stays covered except the answer.
        const covered = active === undefined ? true : isActive ? !revealed : occlusion.mode === 'hide-all';
        if (!covered && !isActive) return null;
        return (
          <span
            key={m.id}
            className={`occl-mask${isActive ? ' is-active' : ''}${covered ? '' : ' is-revealed'}`}
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
          />
        );
      })}
    </div>
  );
}
