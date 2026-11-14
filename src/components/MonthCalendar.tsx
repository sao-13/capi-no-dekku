import './Streaks.css';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, dayKey, formatMonthYear, parseDay, plural } from '../lib/dates';
import { weekStart, type DayActivity } from '../lib/stats';
import type { DayKey } from '../lib/types';

const longWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const narrowWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
// 2024-01-01 was a Monday; used only to produce weekday names in the reader's language.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i));

interface Props {
  activity: Map<DayKey, DayActivity>;
  today: DayKey;
}

export function MonthCalendar({ activity, today }: Props) {
  const [month, setMonth] = useState(() => {
    const t = parseDay(today);
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });

  const isCurrentMonth = dayKey(month).slice(0, 7) === today.slice(0, 7);
  const monthPrefix = dayKey(month).slice(0, 7);

  const rows = useMemo(() => {
    const first = dayKey(month);
    const last = dayKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    const out: DayKey[][] = [];
    let cursor = weekStart(first);
    while (cursor <= last) {
      out.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
      cursor = addDays(cursor, 7);
    }
    return out;
  }, [month]);

  const studiedThisMonth = [...activity.keys()].filter((d) => d.startsWith(monthPrefix)).length;

  const shift = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <div className="calendar">
      <div className="calendar-head">
        <p className="calendar-title" id={`cal-${monthPrefix}`}>
          {formatMonthYear(month)}
        </p>
        <div className="calendar-nav">
          <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" onClick={() => shift(1)} disabled={isCurrentMonth} aria-label="Next month">
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <table className="calendar-table" aria-labelledby={`cal-${monthPrefix}`}>
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d.getDay()} scope="col">
                <abbr title={longWeekday.format(d)}>{narrowWeekday.format(d)}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const inMonth = day.startsWith(monthPrefix);
                if (!inMonth) return <td key={day} aria-hidden="true" />;
                const a = activity.get(day);
                const classes = ['calendar-day', a && 'is-studied', day === today && 'is-today', day > today && 'is-future']
                  .filter(Boolean)
                  .join(' ');
                return (
                  <td key={day}>
                    <span className={classes} aria-current={day === today ? 'date' : undefined}>
                      {parseDay(day).getDate()}
                      <span className="visually-hidden">{a ? `, studied ${plural(a.count, 'card')}` : ''}</span>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="calendar-foot">
        {studiedThisMonth === 0
          ? isCurrentMonth
            ? 'No study days yet this month.'
            : 'No study days this month.'
          : `Studied on ${plural(studiedThisMonth, 'day')}${isCurrentMonth ? ' so far' : ''}.`}
      </p>
    </div>
  );
}
