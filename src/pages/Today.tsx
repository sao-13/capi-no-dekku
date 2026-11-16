import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Plus } from 'lucide-react';
import { FileDrop } from '../components/FileDrop';
import { Heatmap } from '../components/Heatmap';
import { DeckTable } from '../components/DeckTable';
import { Hourglass, SpeechBubble, Tomato } from '../components/Doodles';
import { openTimerPanel } from '../components/Pomodoro';
import { formatLongDate, todayKey } from '../lib/dates';
import { activityByDay, streakInfo } from '../lib/stats';
import { createDeck, useData } from '../lib/store';
import { addSampleDeck } from '../lib/sample';
import { MESSAGES } from '../content/messages';
import './Today.css';

/** What the bubble over the activity grid says, by streak length. */
function streakLine(current: number, studiedToday: boolean): string {
  if (current >= 7) return `ur on fire!! ${current} days~`;
  if (current >= 2) return `ur on fire!! ${current} days in a row`;
  if (current === 1) return studiedToday ? 'day 1! see u tomorrow~' : 'keep it going today!';
  return 'one card starts a streak ^^';
}

export function Today() {
  const data = useData();
  const navigate = useNavigate();
  const today = todayKey();
  const activity = useMemo(() => activityByDay(data.reviews), [data.reviews]);
  const streak = streakInfo(activity, today);
  const [deckName, setDeckName] = useState('');
  const [deckError, setDeckError] = useState<string | null>(null);

  function makeDeck(e: FormEvent) {
    e.preventDefault();
    if (!deckName.trim()) {
      setDeckError('Give the deck a name.');
      return;
    }
    navigate(`/decks/${createDeck({ name: deckName }).id}`);
  }

  return (
    <div className="home">
      <h1 className="visually-hidden">Home, {formatLongDate(today)}</h1>

      <section className="panel home-start" aria-labelledby="start-heading">
        <h2 id="start-heading" className="home-title">
          Create a deck
        </h2>
        <form className="quick-deck" onSubmit={makeDeck} noValidate>
          <label className="visually-hidden" htmlFor="quick-deck-name">
            Deck name
          </label>
          <input
            id="quick-deck-name"
            className="input"
            value={deckName}
            placeholder="Name it after a course, chapter or exam"
            aria-invalid={deckError ? true : undefined}
            aria-describedby={deckError ? 'quick-deck-error' : undefined}
            onChange={(e) => {
              setDeckName(e.target.value);
              setDeckError(null);
            }}
          />
          <button type="submit" className="btn">
            <Plus size={16} aria-hidden="true" />
            Create deck
          </button>
        </form>
        {deckError && (
          <p id="quick-deck-error" className="field-error">
            {deckError}
          </p>
        )}
        <FileDrop size="compact" />
      </section>

      <div className="home-row">
        <section className="panel home-decks" aria-labelledby="decks-heading">
          <h2 id="decks-heading" className="home-title">
            Review your decks
          </h2>
          {data.decks.length ? (
            <DeckTable />
          ) : (
            <div className="home-empty">
              <p className="muted">No decks yet. Make one above, or drop in your notes.</p>
              <button type="button" className="btn btn-sm" onClick={() => navigate(`/decks/${addSampleDeck().id}`)}>
                <BookOpen size={14} aria-hidden="true" />
                Try a sample deck
              </button>
            </div>
          )}
        </section>

        <button type="button" className="tomato doodle" onClick={openTimerPanel} aria-label="Open the focus timer">
          <span className="tomato-art">
            <Tomato size={148} />
            <span className="tomato-glass">
              <Hourglass size={36} />
            </span>
          </span>
          <span className="tomato-note">{MESSAGES.tomato}</span>
        </button>
      </div>

      <section className="panel home-activity" aria-labelledby="activity-heading">
        <div className="home-activity-head">
          <h2 id="activity-heading" className="home-title">
            Activity
          </h2>
          <Link to="/progress" className="section-aside">
            Accuracy and calendar
          </Link>
        </div>
        <SpeechBubble className="home-bubble doodle">{streakLine(streak.current, streak.studiedToday)}</SpeechBubble>
        <Heatmap activity={activity} today={today} maxWeeks={53} />
      </section>
    </div>
  );
}
