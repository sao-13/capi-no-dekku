import { useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { formatShortDate, parseDay, plural } from '../lib/dates';
import type { AccuracyPoint } from '../lib/stats';
import { useElementWidth } from '../lib/useElementWidth';
import './AccuracyChart.css';

const HEIGHT = 232;
const M = { top: 16, right: 48, bottom: 32, left: 44 };
const TICKS = [0, 25, 50, 75, 100];

const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const monthShort = new Intl.DateTimeFormat(undefined, { month: 'short' });

function bucketLabel(p: AccuracyPoint, unit: 'day' | 'week') {
  return unit === 'day' ? weekdayShort.format(parseDay(p.start)) : `Week of ${formatShortDate(p.start)}`;
}

export function describePoint(p: AccuracyPoint, unit: 'day' | 'week') {
  return p.accuracy === null
    ? `${bucketLabel(p, unit)}: no studying`
    : `${bucketLabel(p, unit)}: ${p.accuracy}% right, ${plural(p.total, 'card')}`;
}

interface Props {
  points: AccuracyPoint[];
  unit: 'day' | 'week';
}

/** Single-series line chart of accuracy. Gaps where nothing was studied; hover or arrow keys for details. */
export function AccuracyChart({ points, unit }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const measured = useElementWidth(wrapRef);
  const width = Math.max(measured || 640, 280);
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const liveId = useId();

  const x = (i: number) => M.left + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const y = (v: number) => M.top + innerH - (v / 100) * innerH;

  const [active, setActive] = useState<number | null>(null);
  const [usingKeys, setUsingKeys] = useState(false);

  const segments = useMemo(() => {
    const paths: string[] = [];
    let current = '';
    points.forEach((p, i) => {
      if (p.accuracy === null) {
        if (current) paths.push(current);
        current = '';
        return;
      }
      current += `${current ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.accuracy).toFixed(1)}`;
    });
    if (current) paths.push(current);
    return paths;
  }, [points, width]);

  const lastWithData = points.findLastIndex((p) => p.accuracy !== null);

  const xLabels = useMemo(() => {
    const labels: { i: number; text: string }[] = [];
    if (unit === 'day') {
      for (let i = points.length - 1; i >= 0; i -= 7) labels.push({ i, text: formatShortDate(points[i].start) });
    } else {
      let lastMonth = -1;
      points.forEach((p, i) => {
        const m = parseDay(p.start).getMonth();
        if (m !== lastMonth) {
          if (i > 0 || parseDay(p.start).getDate() <= 7) labels.push({ i, text: monthShort.format(parseDay(p.start)) });
          lastMonth = m;
        }
      });
    }
    // Drop labels that would collide.
    const minGap = 48;
    return labels
      .sort((a, b) => a.i - b.i)
      .filter((l, idx, all) => idx === all.length - 1 || x(all[idx + 1].i) - x(l.i) >= minGap);
  }, [points, unit, width]);

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - M.left) / innerW) * (points.length - 1));
    setUsingKeys(false);
    setActive(Math.max(0, Math.min(points.length - 1, i)));
  }

  function onKeyDown(e: KeyboardEvent) {
    const start = active ?? (lastWithData >= 0 ? lastWithData : points.length - 1);
    let next = start;
    if (e.key === 'ArrowLeft') next = start - 1;
    else if (e.key === 'ArrowRight') next = start + 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = points.length - 1;
    else return;
    e.preventDefault();
    setUsingKeys(true);
    setActive(Math.max(0, Math.min(points.length - 1, next)));
  }

  const activePoint = active !== null ? points[active] : null;
  const tipX = active !== null ? x(active) : 0;
  const tipAlign = tipX > width - 140 ? 'right' : tipX < 140 ? 'left' : 'center';

  return (
    <div className="chart" ref={wrapRef}>
      <div
        className="chart-frame"
        tabIndex={0}
        role="group"
        aria-label={`Accuracy by ${unit}. Use the left and right arrow keys to read each ${unit}.`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? (lastWithData >= 0 ? lastWithData : points.length - 1))}
        onBlur={() => {
          setActive(null);
          setUsingKeys(false);
        }}
      >
        <svg width={width} height={HEIGHT} onMouseMove={onMove} onMouseLeave={() => !usingKeys && setActive(null)} aria-hidden="true">
          {TICKS.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={M.left - 10} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {t}%
              </text>
            </g>
          ))}
          {xLabels.map((l) => (
            <text key={l.i} className="chart-tick" x={x(l.i)} y={HEIGHT - 10} textAnchor="middle">
              {l.text}
            </text>
          ))}

          {active !== null && <line className="chart-crosshair" x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + innerH} />}

          {segments.map((d, i) => (
            <path key={i} className="chart-line" d={d} />
          ))}
          {points.map((p, i) =>
            p.accuracy === null ? null : (
              <circle
                key={p.start}
                className={`chart-dot${i === active ? ' is-active' : ''}`}
                cx={x(i)}
                cy={y(p.accuracy)}
                r={i === active ? 5 : points.length > 40 ? 3 : 4}
              />
            ),
          )}

          {lastWithData >= 0 && active === null && (
            <text className="chart-end-label" x={x(lastWithData) + 10} y={y(points[lastWithData].accuracy!)} dominantBaseline="middle">
              {points[lastWithData].accuracy}%
            </text>
          )}
        </svg>
        {activePoint && (
          <div className={`chart-tip align-${tipAlign}`} style={{ left: tipX, top: M.top }} aria-hidden="true">
            {describePoint(activePoint, unit)}
          </div>
        )}
      </div>
      <p id={liveId} className="visually-hidden" aria-live="polite">
        {usingKeys && activePoint ? describePoint(activePoint, unit) : ''}
      </p>
    </div>
  );
}
