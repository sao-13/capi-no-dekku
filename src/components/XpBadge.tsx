import { useEffect, useMemo, useRef } from 'react';
import { MESSAGES } from '../content/messages';
import { showPopup } from '../lib/popup';
import { useData } from '../lib/store';
import { levelInfo, totalXp } from '../lib/xp';
import './XpBadge.css';

/** Level and an EXP bar. Pops a message when the level goes up. */
export function XpBadge({ compact = false }: { compact?: boolean }) {
  const data = useData();
  const info = useMemo(() => levelInfo(totalXp(data)), [data]);
  const lastLevel = useRef(info.level);

  useEffect(() => {
    // Only the sidebar badge announces, so a level-up isn't announced twice.
    if (!compact && info.level > lastLevel.current) showPopup(MESSAGES.levelUp.replace('{level}', String(info.level)));
    lastLevel.current = info.level;
  }, [info.level, compact]);

  const pct = Math.round((info.into / info.span) * 100);
  const label = `Level ${info.level}, ${info.into} of ${info.span} EXP to the next level`;

  if (compact) {
    return (
      <span className="xp is-compact" title={label} aria-label={label}>
        Lv{info.level}
      </span>
    );
  }

  return (
    <div className="xp" title={`${info.total} EXP in all`}>
      <div className="xp-row">
        <span className="xp-level">Lv {info.level}</span>
        <span className="xp-num">
          {info.into}/{info.span} EXP
        </span>
      </div>
      <div className="xp-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={info.span} aria-valuenow={info.into}>
        <span className="xp-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
