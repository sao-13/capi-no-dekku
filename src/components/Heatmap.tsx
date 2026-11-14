import './Streaks.css';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { addDays, formatLongDate, parseDay, plural } from '../lib/dates';
import { HEAT_LEVELS, heatLevel, heatmapWeeks, type DayActivity } from '../lib/stats';
import { useElementWidth } from '../lib/useElementWidth';
import type { DayKey } from '../lib/types';

const CELL = 12;
const GAP = 3;
const LABEL_COL = 32;
const MONTH_ROW = 18;

const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

function describeDay(day: DayKey, activity?: DayActivity): string {
  if (!activity) return `${formatLongDate(day)}: no studying`;
  return `${formatLongDate(day)}: ${plural(activity.count, 'card')}, ${activity.correct} right`;
}

interface Props {
  activity: Map<DayKey, DayActivity>;
  today: DayKey;
  maxWeeks: number;
}

/**
 * A grid of days, one column per week, shaded by how many cards were studied.
 * Hover or arrow keys show the day's count; the grid is one tab stop.
 */
export function Heatmap({ activity, today, maxWeeks }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const liveId = useId();
  const width = useElementWidth(wrapRef);
  const fit = width ? Math.floor((width - LABEL_COL + GAP) / (CELL + GAP)) : maxWeeks;
  const weeks = Math.max(8, Math.min(maxWeeks, fit));
  const columns = useMemo(() => heatmapWeeks(weeks, today), [weeks, today]);
  const firstDay = columns[0][0]!;

  const [active, setActive] = useState<DayKey | null>(null);
  const [cursor, setCursor] = useState<DayKey>(today);
  const [usingKeys, setUsingKeys] = useState(false);

  const position = useMemo(() => {
    const map = new Map<DayKey, { col: number; row: number }>();
    columns.forEach((col, c) => col.forEach((day, r) => day && map.set(day, { col: c, row: r })));
    return map;
  }, [columns]);

  const totals = useMemo(() => {
    let days = 0;
    let cards = 0;
    for (const [day, a] of activity) {
      if (day >= firstDay && day <= today) {
        days += 1;
        cards += a.count;
      }
    }
    return { days, cards };
  }, [activity, firstDay, today]);

  const monthLabels = useMemo(() => {
    const labels: { col: number; text: string }[] = [];
    let lastMonth = -1;
    columns.forEach((col, c) => {
      const month = parseDay(col[0]!).getMonth();
      if (month !== lastMonth) {
        // Skip a label squeezed against the left edge by a partial month.
        if (!(c === 0 && parseDay(col[0]!).getDate() > 21)) labels.push({ col: c, text: monthFmt.format(parseDay(col[0]!)) });
        lastMonth = month;
      }
    });
    return labels.filter((l, i, all) => i === all.length - 1 || all[i + 1].col - l.col >= 3);
  }, [columns]);

  function onKeyDown(e: KeyboardEvent) {
    const moves: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
    let next: DayKey | null = null;
    if (e.key in moves) next = addDays(cursor, moves[e.key]);
    else if (e.key === 'Home') next = firstDay;
    else if (e.key === 'End') next = today;
    if (!next) return;
    e.preventDefault();
    if (next < firstDay) next = firstDay;
    if (next > today) next = today;
    setCursor(next);
    setActive(next);
    setUsingKeys(true);
  }

  const shown = active ? position.get(active) : undefined;
  const tipLeft = shown ? LABEL_COL + shown.col * (CELL + GAP) + CELL / 2 : 0;
  const tipAlign = shown && width && tipLeft > width - 110 ? 'right' : shown && tipLeft < 110 ? 'left' : 'center';

  return (
    <div className="heatmap" ref={wrapRef}>
      <div
        className="heatmap-grid"
        role="group"
        tabIndex={0}
        aria-label={`Study activity for the last ${weeks} weeks: ${plural(totals.days, 'day')} studied, ${plural(totals.cards, 'card')} in all. Use the arrow keys to read each day.`}
        aria-describedby={liveId}
        style={{
          gridTemplateColumns: `${LABEL_COL - GAP}px repeat(${weeks}, ${CELL}px)`,
          gridTemplateRows: `${MONTH_ROW - GAP}px repeat(7, ${CELL}px)`,
          gap: `${GAP}px`,
        }}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setActive(cursor);
        }}
        onBlur={() => {
          setActive(null);
          setUsingKeys(false);
        }}
        onMouseLeave={() => !usingKeys && setActive(null)}
      >
        {monthLabels.map((m) => (
          <span key={m.col} className="heatmap-month" style={{ gridColumn: m.col + 2, gridRow: 1 }} aria-hidden="true">
            {m.text}
          </span>
        ))}
        {[0, 2, 4].map((r) => (
          <span key={r} className="heatmap-weekday" style={{ gridColumn: 1, gridRow: r + 2 }} aria-hidden="true">
            {weekdayFmt.format(parseDay(addDays(columns[0][0]!, r)))}
          </span>
        ))}
        {columns.map((col, c) =>
          col.map((day, r) =>
            day ? (
              <span
                key={day}
                className={`heatmap-cell level-${heatLevel(activity.get(day)?.count ?? 0)}${active === day ? ' is-active' : ''}${day === today ? ' is-today' : ''}`}
                style={{ gridColumn: c + 2, gridRow: r + 2 }}
                onMouseEnter={() => {
                  setUsingKeys(false);
                  setActive(day);
                }}
                aria-hidden="true"
              />
            ) : null,
          ),
        )}
      </div>

      {shown && active && (
        <div
          className={`heatmap-tip align-${tipAlign}`}
          style={{ left: tipLeft, top: MONTH_ROW + shown.row * (CELL + GAP) }}
          aria-hidden="true"
        >
          {describeDay(active, activity.get(active))}
        </div>
      )}
      <p id={liveId} className="visually-hidden" aria-live="polite">
        {usingKeys && active ? describeDay(active, activity.get(active)) : ''}
      </p>

      <ul className="heatmap-legend" aria-label="Shade key">
        {HEAT_LEVELS.map((level, i) => (
          <li key={level.short}>
            <span className={`heatmap-cell level-${i}`} aria-hidden="true" />
            {level.short}
          </li>
        ))}
        <li className="heatmap-legend-unit">cards a day</li>
      </ul>
    </div>
  );
}
