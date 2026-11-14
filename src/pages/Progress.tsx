import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChartLine } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { AccuracyChart, describePoint } from '../components/AccuracyChart';
import { Heatmap } from '../components/Heatmap';
import { MonthCalendar } from '../components/MonthCalendar';
import { addDays, formatAgo, plural, todayKey } from '../lib/dates';
import { isMastered } from '../lib/srs';
import { accuracySeries, activityByDay, deckProgress, streakInfo } from '../lib/stats';
import { useData } from '../lib/store';
import '../components/AccuracyChart.css';
import './Progress.css';

type Range = 'month' | 'half';

const RANGES: Record<Range, { label: string; unit: 'day' | 'week'; count: number }> = {
  month: { label: 'Last 30 days', unit: 'day', count: 30 },
  half: { label: 'Last 26 weeks', unit: 'week', count: 26 },
};

export function Progress() {
  const data = useData();
  const today = todayKey();
  const [range, setRange] = useState<Range>('month');
  const activity = useMemo(() => activityByDay(data.reviews), [data.reviews]);
  const streak = streakInfo(activity, today);
  const points = useMemo(
    () => accuracySeries(activity, today, { unit: RANGES[range].unit, count: RANGES[range].count }),
    [activity, today, range],
  );
  const decks = useMemo(() => deckProgress(data), [data]);

  if (data.reviews.length === 0) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Progress</h1>
        </header>
        <EmptyState
          icon={ChartLine}
          title="No reviews to chart yet"
          actions={
            <Link to={data.decks.length ? '/decks' : '/decks?new=1'} className="btn btn-primary">
              {data.decks.length ? 'Pick a deck to study' : 'Make your first deck'}
            </Link>
          }
        >
          Once you study or take a quiz, this page shows how many cards you've mastered, how your accuracy changes, and
          which decks need more time.
        </EmptyState>
      </div>
    );
  }

  const mastered = data.cards.filter(isMastered).length;
  const monthStart = addDays(today, -29);
  let monthTotal = 0;
  let monthCorrect = 0;
  let weekTotal = 0;
  for (const [day, a] of activity) {
    if (day >= monthStart) {
      monthTotal += a.count;
      monthCorrect += a.correct;
    }
    if (day >= addDays(today, -6)) weekTotal += a.count;
  }
  const monthAccuracy = monthTotal ? Math.round((monthCorrect / monthTotal) * 100) : null;
  const studied = points.filter((p) => p.accuracy !== null);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Progress</h1>
        <p className="page-lede">
          {`You've mastered ${mastered} of ${plural(data.cards.length, 'card')}`}
          {monthAccuracy !== null ? ` and answered ${monthAccuracy}% correctly over the last 30 days.` : '. Nothing studied in the last 30 days.'}
        </p>
      </header>

      <dl className="progress-facts">
        <div>
          <dt>Mastered</dt>
          <dd>
            {mastered}
            <span className="fact-of"> of {data.cards.length}</span>
          </dd>
          <p className="fact-note">Cards you'll next see in 16+ days</p>
        </div>
        <div>
          <dt>Accuracy, 30 days</dt>
          <dd>{monthAccuracy === null ? '–' : `${monthAccuracy}%`}</dd>
          <p className="fact-note">{plural(monthTotal, 'answer')}</p>
        </div>
        <div>
          <dt>This week</dt>
          <dd>{weekTotal}</dd>
          <p className="fact-note">Cards studied in 7 days</p>
        </div>
        <div>
          <dt>Streak</dt>
          <dd>{streak.current}</dd>
          <p className="fact-note">Longest {plural(streak.longest, 'day')}</p>
        </div>
      </dl>

      <section className="section" aria-labelledby="accuracy-heading">
        <div className="section-head">
          <h2 id="accuracy-heading">Accuracy over time</h2>
          <div className="segmented" role="group" aria-label="Time range">
            {(Object.keys(RANGES) as Range[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={range === key}
                className="segmented-option"
                onClick={() => setRange(key)}
              >
                {RANGES[key].label}
              </button>
            ))}
          </div>
        </div>
        <p className="chart-caption">
          Share of answers marked "Knew it" or chosen correctly in a quiz, {RANGES[range].unit === 'day' ? 'per day' : 'per week'}.
          Gaps are {RANGES[range].unit === 'day' ? 'days' : 'weeks'} with no studying.
        </p>
        {studied.length === 0 ? (
          <p className="muted">No studying in this range. Try the longer range, or study a deck to add a point.</p>
        ) : (
          <AccuracyChart points={points} unit={RANGES[range].unit} />
        )}
        <details className="chart-table-toggle">
          <summary>Show these numbers as a table</summary>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="visually-hidden">Accuracy by {RANGES[range].unit}</caption>
              <thead>
                <tr>
                  <th scope="col">{RANGES[range].unit === 'day' ? 'Day' : 'Week'}</th>
                  <th scope="col" className="num">
                    Cards
                  </th>
                  <th scope="col" className="num">
                    Right
                  </th>
                  <th scope="col" className="num">
                    Accuracy
                  </th>
                </tr>
              </thead>
              <tbody>
                {studied
                  .slice()
                  .reverse()
                  .map((p) => (
                    <tr key={p.start}>
                      <td>{describePoint(p, RANGES[range].unit).split(':')[0]}</td>
                      <td className="num">{p.total}</td>
                      <td className="num">{p.correct}</td>
                      <td className="num">{p.accuracy}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="section" aria-labelledby="year-heading">
        <div className="section-head">
          <h2 id="year-heading">The past year</h2>
          <span className="section-aside">{plural(activity.size, 'day')} studied in all</span>
        </div>
        <Heatmap activity={activity} today={today} maxWeeks={53} />
      </section>

      <section className="section" aria-labelledby="calendar-heading">
        <div className="section-head">
          <h2 id="calendar-heading">Study days</h2>
          <span className="section-aside">{streak.current ? `${plural(streak.current, 'day')} in a row` : 'No streak right now'}</span>
        </div>
        <MonthCalendar activity={activity} today={today} />
      </section>

      <section className="section" aria-labelledby="decks-heading">
        <div className="section-head">
          <h2 id="decks-heading">By deck</h2>
        </div>
        {decks.length === 0 ? (
          <p className="muted">Your decks were deleted, but their reviews still count above.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table progress-deck-table">
              <thead>
                <tr>
                  <th scope="col">Deck</th>
                  <th scope="col">Mastered</th>
                  <th scope="col" className="num">
                    Accuracy
                  </th>
                  <th scope="col" className="num">
                    Answers
                  </th>
                  <th scope="col" className="num">
                    Last studied
                  </th>
                </tr>
              </thead>
              <tbody>
                {decks.map((d) => {
                  const pct = d.cards ? Math.round((d.mastered / d.cards) * 100) : 0;
                  return (
                    <tr key={d.deckId}>
                      <th scope="row">
                        <Link to={`/decks/${d.deckId}`} className="progress-deck-name">
                          {d.name}
                        </Link>
                      </th>
                      <td>
                        <div className="mastery">
                          <div className="progress-track" aria-hidden="true">
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span>
                            {d.mastered} of {d.cards}
                          </span>
                        </div>
                      </td>
                      <td className="num">{d.accuracy === null ? '–' : `${d.accuracy}%`}</td>
                      <td className="num">{d.reviews}</td>
                      <td className="num">{formatAgo(d.lastStudied)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
