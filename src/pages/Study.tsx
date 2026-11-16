import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, Check, FolderOpen, Lightbulb, ListChecks, RotateCcw, X } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { answerStudy, useData } from '../lib/store';
import { describeInterval, itemsOf, nextDueDay, nextIntervalDays, typeOf, TYPE_LABEL, type Item } from '../lib/srs';
import { faces } from '../components/CardContent';
import { RichText } from '../components/RichText';
import { OcclusionView } from '../components/OcclusionView';
import { clozeAnswer, plainText } from '../lib/markup';
import { shuffle } from '../lib/quiz';
import { useSessionCheers } from '../lib/useSessionCheers';
import { whoosh } from '../lib/sound';
import { gradeTyped, type TypeinResult } from '../lib/typein';
import { SessionBar } from '../components/SessionBar';
import { StickyNotes } from '../components/StickyNotes';
import { setNotesOpen, useCardNote, useNotesOpen } from '../lib/notes';
import { formatRelativeDay, plural, todayKey } from '../lib/dates';
import type { AppData, DayKey, Grade } from '../lib/types';
import './Study.css';

const NEW_PER_SESSION = 20;
/** "Almost" holds a card back this long, unless nothing else is left to show. */
const ALMOST_HOLD_MS = 5 * 60 * 1000;
/** "Didn't understand" (and a wrong auto-graded answer) comes back after this many other cards. */
const AGAIN_AFTER = 3;

/** Due reviews first (oldest first), then up to NEW_PER_SESSION new items in the order they were written. */
function buildQueue(data: AppData, deckId: string | undefined, today: DayKey, ahead: boolean): string[] {
  const items = data.cards.filter((c) => !deckId || c.deckId === deckId).flatMap(itemsOf);
  if (ahead) return items.sort((a, b) => a.srs.due.localeCompare(b.srs.due) || a.card.createdAt - b.card.createdAt).map((i) => i.key);
  const due = items.filter((i) => i.srs.due <= today);
  const reviews = due.filter((i) => i.srs.reps > 0).sort((a, b) => a.srs.due.localeCompare(b.srs.due));
  const fresh = due
    .filter((i) => i.srs.reps === 0)
    .sort((a, b) => a.card.createdAt - b.card.createdAt)
    .slice(0, NEW_PER_SESSION);
  return [...reviews, ...fresh].map((i) => i.key);
}

/** Reveal part of each word: a third per hint level, at least the first letter. */
function hintFor(answer: string, level: number): string {
  return answer
    .split(/(\s+)/)
    .map((w) =>
      /^\s+$/.test(w)
        ? w
        : [...w].map((ch, i) => (i < Math.max(1, Math.ceil((w.length * level) / 3)) || !/[\p{L}\p{N}]/u.test(ch) ? ch : '_')).join(''),
    )
    .join('');
}

interface Tally {
  firstTry: Map<string, boolean>;
  answers: number;
}

export function Study() {
  const { deckId } = useParams();
  const [params, setParams] = useSearchParams();
  const ahead = params.get('ahead') === '1';
  const data = useData();
  const deck = deckId ? data.decks.find((d) => d.id === deckId) : undefined;
  const today = todayKey();

  // The queue is fixed when the session starts (or restarts); answers update the store without reshuffling it.
  const [sessionKey, setSessionKey] = useState(0);
  const [queue, setQueue] = useState<string[]>(() => buildQueue(data, deckId, today, ahead));
  const [position, setPosition] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState<Tally>({ firstTry: new Map(), answers: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const cheers = useSessionCheers();
  const [hintLevel, setHintLevel] = useState(0);
  const [ruledOut, setRuledOut] = useState<Set<number>>(new Set());
  const [chosen, setChosen] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [typedResult, setTypedResult] = useState<TypeinResult | null>(null);
  const typedRef = useRef<HTMLInputElement>(null);
  /** Queue keys rated "Almost", with the time they may come back. */
  const holds = useRef(new Map<string, number>());
  const notesOpen = useNotesOpen();
  const finishedAnnounced = useRef(false);

  const restart = useCallback(
    (studyAhead: boolean) => {
      setQueue(buildQueue(data, deckId, todayKey(), studyAhead));
      setPosition(0);
      setFlipped(false);
      setTyped('');
      setTypedResult(null);
      holds.current = new Map();
      setTally({ firstTry: new Map(), answers: 0 });
      setSessionKey((k) => k + 1);
      cheers.reset();
      finishedAnnounced.current = false;
    },
    [data, deckId, cheers],
  );

  // Rebuild when the route or "study ahead" changes.
  const routeKey = `${deckId ?? 'all'}:${ahead}`;
  const lastRoute = useRef(routeKey);
  useEffect(() => {
    if (lastRoute.current !== routeKey) {
      lastRoute.current = routeKey;
      restart(ahead);
    }
  }, [routeKey, ahead, restart]);

  const itemsByKey = useMemo(() => new Map(data.cards.flatMap(itemsOf).map((i) => [i.key, i])), [data.cards]);
  // Skip cards that were deleted mid-session.
  const liveQueue = queue.filter((key) => itemsByKey.has(key));
  const current: Item | undefined = itemsByKey.get(liveQueue[position]);
  const finished = liveQueue.length > 0 && position >= liveQueue.length;
  const isMcq = current ? typeOf(current.card) === 'mcq' : false;
  const isTypein = current ? typeOf(current.card) === 'typein' : false;
  const currentNote = useCardNote(current?.card.id ?? '');
  // Gizmo Style choices, shuffled afresh each time the card comes up.
  const options = useMemo(
    () => (current && isMcq ? shuffle([current.card.back, ...(current.card.wrong ?? [])]) : []),
    [current?.key, position, isMcq],
  );

  useEffect(() => {
    if (finished && !finishedAnnounced.current) {
      finishedAnnounced.current = true;
      cheers.finished();
    }
  }, [finished, cheers]);

  // Type-in cards start in the answer box.
  useEffect(() => {
    if (!isTypein || flipped) return;
    // A frame later, so it lands after FocusLayout moves focus to <main> on arriving at the page.
    const frame = requestAnimationFrame(() => typedRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [current?.key, position, isTypein, flipped]);

  const flip = useCallback(() => {
    setFlipped(true);
    whoosh();
    requestAnimationFrame(() => answerRef.current?.focus({ preventScroll: true }));
  }, []);

  const answer = useCallback(
    (grade: Grade) => {
      if (!current || !flipped) return;
      // Gizmo Style and Type-in answers are cheered when checked; the rest when rated.
      if (!isMcq && !isTypein) cheers.record(grade === 1);
      answerStudy(current.card.id, current.variant, grade);
      setTally((t) => {
        const firstTry = new Map(t.firstTry);
        if (!firstTry.has(current.key)) firstTry.set(current.key, grade === 1);
        return { firstTry, answers: t.answers + 1 };
      });

      const now = Date.now();
      const holdUntil = holds.current;
      holdUntil.delete(current.key);
      const rest = liveQueue.slice(position + 1);
      if (grade === 3) rest.splice(Math.min(AGAIN_AFTER, rest.length), 0, current.key);
      if (grade === 2) {
        rest.push(current.key);
        holdUntil.set(current.key, now + ALMOST_HOLD_MS);
      }
      // A card on hold waits behind any ready card; if every card left is on hold, the soonest comes now.
      const held = (key: string) => (holdUntil.get(key) ?? 0) > now;
      if (rest.length > 1 && held(rest[0])) {
        const ready = rest.findIndex((key) => !held(key));
        const pick = ready >= 0 ? ready : rest.reduce((soonest, key, i) => (holdUntil.get(key)! < holdUntil.get(rest[soonest])! ? i : soonest), 0);
        rest.unshift(...rest.splice(pick, 1));
      }
      if (rest.length) holdUntil.delete(rest[0]);
      const nextQueue = [...liveQueue.slice(0, position + 1), ...rest];
      setQueue(nextQueue);
      cheers.progress((position + 1) / nextQueue.length);

      setFlipped(false);
      setHintLevel(0);
      setRuledOut(new Set());
      setChosen(null);
      setTyped('');
      setTypedResult(null);
      setPosition((p) => p + 1);
      requestAnimationFrame(() => (typedRef.current ?? stageRef.current)?.focus({ preventScroll: true }));
    },
    [current, flipped, isMcq, isTypein, cheers, position, liveQueue],
  );

  const choose = useCallback(
    (i: number) => {
      if (!current || chosen !== null || ruledOut.has(i)) return;
      setChosen(i);
      setFlipped(true);
      whoosh();
      cheers.record(options[i] === current.card.back);
      requestAnimationFrame(() => answerRef.current?.querySelector<HTMLButtonElement>('.mcq-next')?.focus());
    },
    [current, chosen, ruledOut, options, cheers],
  );

  const checkTyped = useCallback(() => {
    if (!current || flipped || !isTypein) return;
    const result = gradeTyped(typed, faces(current.card, current.variant).answer);
    setTypedResult(result);
    setFlipped(true);
    whoosh();
    cheers.record(result.correct);
    requestAnimationFrame(() => answerRef.current?.querySelector<HTMLButtonElement>('.mcq-next')?.focus());
  }, [current, flipped, isTypein, typed, cheers]);

  const hint = useCallback(() => {
    if (!current || flipped) return;
    if (isMcq) {
      const wrongIdx = options.map((o, i) => (o === current.card.back || ruledOut.has(i) ? -1 : i)).filter((i) => i >= 0);
      if (wrongIdx.length <= 1) return;
      setRuledOut((r) => new Set(r).add(wrongIdx[Math.floor(Math.random() * wrongIdx.length)]));
      return;
    }
    if (hintLevel >= 2) return;
    setHintLevel((l) => l + 1);
    if (isTypein) requestAnimationFrame(() => typedRef.current?.focus({ preventScroll: true }));
  }, [current, flipped, isMcq, isTypein, options, ruledOut, hintLevel]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, dialog')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!current) return;
      // A held-down key must not flip a card and then rate or skip it.
      if (e.repeat) {
        if ([' ', 'Enter', '1', '2', '3'].includes(e.key)) e.preventDefault();
        return;
      }
      const onControl = !!target.closest('button, a');
      if (isMcq) {
        const n = Number(e.key);
        if (!flipped && n >= 1 && n <= options.length) {
          e.preventDefault();
          choose(n - 1);
        } else if (!flipped && e.key.toLowerCase() === 'h') {
          e.preventDefault();
          hint();
        } else if (flipped && chosen !== null && e.key === 'Enter' && !onControl) {
          e.preventDefault();
          answer(options[chosen] === current.card.back ? 1 : 3);
        }
        return;
      }
      if (isTypein) {
        if (!flipped && e.key.toLowerCase() === 'h') {
          e.preventDefault();
          hint();
        } else if (flipped && typedResult && (e.key === '1' || ((e.key === ' ' || e.key === 'Enter') && !onControl))) {
          e.preventDefault();
          answer(typedResult.correct ? 1 : 3);
        }
        return;
      }
      if (!flipped && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        hint();
        return;
      }
      if (!flipped && (e.key === ' ' || e.key === 'Enter') && !onControl) {
        e.preventDefault();
        flip();
      } else if (flipped && (e.key === '1' || ((e.key === ' ' || e.key === 'Enter') && !onControl))) {
        e.preventDefault();
        answer(1);
      } else if (flipped && e.key === '2') {
        e.preventDefault();
        answer(2);
      } else if (flipped && e.key === '3') {
        e.preventDefault();
        answer(3);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, flipped, flip, answer, isMcq, isTypein, typedResult, options, choose, chosen, hint]);

  const backTo = deck ? `/decks/${deck.id}` : '/';
  const backLabel = deck ? deck.name : 'Today';

  if (deckId && !deck) {
    return (
      <div className="sheet">
        <div className="page">
          <EmptyState
            icon={FolderOpen}
            title="This deck isn't here anymore"
            headingLevel="h1"
            actions={
              <Link to="/decks" className="btn">
                See all decks
              </Link>
            }
          >
            It may have been deleted. Your study history is still counted in your streak.
          </EmptyState>
        </div>
      </div>
    );
  }

  const pool = data.cards.filter((c) => !deckId || c.deckId === deckId);

  if (liveQueue.length === 0) {
    if (pool.length === 0) {
      return (
        <div className="sheet">
          <div className="page">
            <EmptyState
              icon={FolderOpen}
              title={deck ? 'There are no cards to study in this deck' : 'You have no cards yet'}
              headingLevel="h1"
              actions={
                <Link to={deck ? backTo : '/decks'} className="btn btn-primary">
                  {deck ? 'Add cards' : 'Go to decks'}
                </Link>
              }
            >
              Studying works on cards you've written or imported. Add a few, then come back here.
            </EmptyState>
          </div>
        </div>
      );
    }
    const nextDue = pool.map(nextDueDay).sort()[0];
    const nextCount = pool.flatMap(itemsOf).filter((i) => i.srs.due === nextDue).length;
    return (
      <div className="sheet">
        <div className="page">
          <EmptyState
            icon={CalendarCheck}
            title="You're caught up"
            headingLevel="h1"
            actions={
              <>
                <button type="button" className="btn btn-primary" onClick={() => setParams({ ahead: '1' })}>
                  Study ahead anyway
                </button>
                <Link to={backTo} className="btn">
                  Back to {backLabel}
                </Link>
              </>
            }
          >
            {`Nothing is due ${deck ? 'in this deck ' : ''}today. ${
              nextCount === 1 ? 'One card comes' : `${nextCount} cards come`
            } back ${formatRelativeDay(nextDue)}. Studying ahead still counts toward your streak.`}
          </EmptyState>
        </div>
      </div>
    );
  }

  if (finished) {
    const firstTryKnown = [...tally.firstTry.values()].filter(Boolean).length;
    const unique = tally.firstTry.size;
    const upcoming = pool.flatMap(itemsOf).filter((i) => i.srs.due > today);
    const nextDue = upcoming.map((i) => i.srs.due).sort()[0];
    const nextCount = nextDue ? upcoming.filter((i) => i.srs.due === nextDue).length : 0;
    return (
      <div className="sheet">
        <div className="page study-done">
          <header className="page-head">
            <Link to={backTo} className="breadcrumb">
              <ArrowLeft size={16} aria-hidden="true" />
              {backLabel}
            </Link>
            <h1>That's the session</h1>
            <p className="page-lede">
              {unique === firstTryKnown
                ? `You knew all ${plural(unique, 'card')} on the first try.`
                : unique - firstTryKnown === 1
                  ? `You knew ${firstTryKnown} of ${plural(unique, 'card')} on the first try, and went back over the other one until it stuck.`
                  : `You knew ${firstTryKnown} of ${plural(unique, 'card')} on the first try, and went back over the other ${unique - firstTryKnown} until they stuck.`}
            </p>
          </header>
          <dl className="session-facts">
            <div>
              <dt>Cards reviewed</dt>
              <dd>{unique}</dd>
            </div>
            <div>
              <dt>Answers given</dt>
              <dd>{tally.answers}</dd>
            </div>
            <div>
              <dt>Next review</dt>
              <dd className="session-next">{nextDue ? `${plural(nextCount, 'card')} ${formatRelativeDay(nextDue)}` : 'Nothing scheduled'}</dd>
            </div>
          </dl>
          <div className="btn-row">
            <Link to={backTo} className="btn btn-primary">
              Back to {backLabel}
            </Link>
            {deck && (
              <Link to={`/decks/${deck.id}/quiz`} className="btn">
                <ListChecks size={16} aria-hidden="true" />
                Test yourself with a quiz
              </Link>
            )}
            <button type="button" className="btn" onClick={() => restart(true)}>
              <RotateCcw size={16} aria-hidden="true" />
              Go through every card again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const remaining = liveQueue.length - position;
  const cardDeck = deck ?? data.decks.find((d) => d.id === current.card.deckId);
  const { question, answer: answerText, extra } = faces(current.card, current.variant);
  const occlusion = typeOf(current.card) === 'occlusion' ? current.card.occlusion : undefined;
  const spoken = (t: string) => plainText(t) || 'Image card';
  const type = typeOf(current.card);
  const hintSource =
    type === 'cloze' ? plainText(clozeAnswer(current.card.front, Number(current.variant.slice(1)) || 1)) : plainText(answerText);
  const canHint = !flipped && type !== 'occlusion' && (isMcq ? options.length - 1 - ruledOut.size > 1 : hintLevel < 2);
  const mcqRight = chosen !== null && options[chosen] === current.card.back;
  const typedSpoken =
    typedResult &&
    [
      `You typed: ${typedResult.typed.map((w) => w.text).join(' ') || 'nothing'}`,
      typedResult.typed.some((w) => !w.right) && `Wrong: ${typedResult.typed.filter((w) => !w.right).map((w) => w.text).join(' ')}`,
      typedResult.answer.some((p) => p.missed) && `Missed: ${typedResult.answer.filter((p) => p.missed).map((p) => p.text).join(' ')}`,
    ]
      .filter(Boolean)
      .join('. ');

  return (
    <div className="study" key={sessionKey}>
      <SessionBar
        backTo={backTo}
        backLabel={`End session, back to ${backLabel}`}
        title={deck?.name ?? 'All decks'}
        progress={{ value: position, max: liveQueue.length, label: 'Session progress' }}
        left={
          <>
            {plural(remaining, 'card')} left
            {tally.firstTry.size > 0 && (
              <span className="serious-only">
                {', '}
                {Math.round(([...tally.firstTry.values()].filter(Boolean).length / tally.firstTry.size) * 100)}% right first try
              </span>
            )}
          </>
        }
        earned={cheers.earned}
        gain={cheers.gain}
        notes={{ open: notesOpen, hasNote: currentNote.trim() !== '', onToggle: () => setNotesOpen(!notesOpen) }}
      />

      <div className="sticky-host">
        <div className="study-stage" ref={stageRef} tabIndex={-1} aria-label="Flashcard">
          <p className="visually-hidden" aria-live="polite">
            {flipped
              ? `Answer: ${spoken(answerText)}${extra ? `. ${plainText(extra)}` : ''}${typedSpoken ? `. ${typedSpoken}.` : ''}`
              : `Card ${position + 1} of ${liveQueue.length}. ${spoken(question)}`}
          </p>
          <div className={`index-card${flipped ? ' is-flipped' : ''}${occlusion ? ' has-image' : ''}`}>
            <div className="index-card-inner">
              <section className="index-face index-front" aria-hidden={flipped}>
                <header className="index-meta">
                  <span>{cardDeck?.name}</span>
                  <span>
                    {typeOf(current.card) !== 'basic' && `${TYPE_LABEL[typeOf(current.card)]}, `}
                    {current.srs.reps === 0 ? 'new' : 'review'}
                  </span>
                </header>
                <div className="index-text">
                  {question && <RichText text={question} as="div" />}
                  {occlusion && <OcclusionView occlusion={occlusion} active={current.variant} />}
                  {hintLevel > 0 && !isMcq && (
                    <p className="index-hint">
                      <span className="visually-hidden">Hint: </span>
                      {hintFor(hintSource, hintLevel)}
                    </p>
                  )}
                </div>
              </section>
              <section className="index-face index-back" aria-hidden={!flipped}>
                <header className="index-meta">
                  <RichText className="index-prompt" text={occlusion ? cardDeck?.name ?? '' : question} />
                </header>
                <div className="index-text index-answer">
                  {typedResult?.answer.some((p) => p.missed) ? (
                    <div>{typedResult.answer.map((p, i) => (p.missed ? <u key={i}>{p.text}</u> : <Fragment key={i}>{p.text}</Fragment>))}</div>
                  ) : (
                    answerText && <RichText text={answerText} as="div" />
                  )}
                  {occlusion && <OcclusionView occlusion={occlusion} active={current.variant} revealed />}
                  {extra && <RichText text={extra} as="div" className="index-extra" />}
                  {typedResult && (
                    <p className="index-extra typein-typed">
                      You typed:{' '}
                      {typedResult.typed.length
                        ? typedResult.typed.map((w, i) => (
                            <Fragment key={i}>
                              {i > 0 && ' '}
                              <span className={w.right ? 'is-right' : 'is-wrong'}>{w.text}</span>
                            </Fragment>
                          ))
                        : 'Nothing typed'}
                    </p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>

        <div className="study-controls" ref={answerRef} tabIndex={-1}>
          {isMcq && (
            <ol className="mcq-options" aria-label="Choose the answer">
              {options.map((o, i) => {
                const isRight = o === current.card.back;
                const state =
                  chosen === null ? (ruledOut.has(i) ? ' is-out' : '') : isRight ? ' is-answer' : i === chosen ? ' is-wrong' : ' is-dim';
                return (
                  <li key={i}>
                    <button type="button" className={`mcq-option${state}`} onClick={() => choose(i)} disabled={ruledOut.has(i) || (chosen !== null && !isRight && i !== chosen)}>
                      <span className="mcq-key" aria-hidden="true">
                        {i + 1}
                      </span>
                      <RichText text={o} className="mcq-text" />
                      {chosen !== null && isRight && (
                        <span className="mcq-mark">
                          <Check size={15} aria-hidden="true" /> {i === chosen ? 'Your answer' : 'Right answer'}
                        </span>
                      )}
                      {chosen !== null && !isRight && i === chosen && (
                        <span className="mcq-mark">
                          <X size={15} aria-hidden="true" /> Your answer
                        </span>
                      )}
                      {ruledOut.has(i) && chosen === null && <span className="mcq-mark">Ruled out</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {isMcq ? (
            chosen !== null && (
              <div className="mcq-foot">
                <p className={`mcq-result ${mcqRight ? 'is-right' : 'is-wrong'}`} role="status">
                  {mcqRight ? 'Right!' : 'Not this one. It comes back later this session.'}
                </p>
                <button type="button" className="btn btn-primary mcq-next" onClick={() => answer(mcqRight ? 1 : 3)}>
                  Next card <kbd>Enter</kbd>
                </button>
              </div>
            )
          ) : isTypein ? (
            typedResult ? (
              <div className="mcq-foot">
                <p className={`mcq-result ${typedResult.correct ? 'is-right' : 'is-wrong'}`} role="status">
                  {typedResult.correct ? 'Right!' : 'Not quite. It comes back after a few cards.'}
                </p>
                <button type="button" className="btn btn-primary mcq-next" onClick={() => answer(typedResult.correct ? 1 : 3)}>
                  Next card <kbd>Enter</kbd>
                </button>
              </div>
            ) : (
              <form
                className="field"
                onSubmit={(e) => {
                  e.preventDefault();
                  checkTyped();
                }}
              >
                <label htmlFor="typein-answer" className="visually-hidden">
                  Your answer
                </label>
                <input
                  ref={typedRef}
                  id="typein-answer"
                  className="input"
                  type="text"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter held down from the previous card must not check this one blank.
                    if (e.repeat && e.key === 'Enter') e.preventDefault();
                  }}
                  placeholder="Your answer"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <button type="submit" className="btn btn-lg study-reveal">
                  Check <kbd>Enter</kbd>
                </button>
              </form>
            )
          ) : !flipped ? (
            <>
              <button type="button" className="btn btn-lg study-reveal" onClick={flip}>
                Show answer <kbd>Space</kbd>
              </button>
              <p className="field-hint study-legend">
                Then rate it: <kbd>1</kbd> Understood well, <kbd>2</kbd> Almost, <kbd>3</kbd> Didn't understand
              </p>
            </>
          ) : (
            <div className="study-answers" role="group" aria-label="How did you do?">
              <button type="button" className="answer-btn is-good" onClick={() => answer(1)}>
                <span className="answer-label">
                  Understood well <kbd>1</kbd>
                </span>
                <span className="answer-hint">Earns the point. Next review {describeInterval(nextIntervalDays(current.srs))}</span>
              </button>
              <button type="button" className="answer-btn" onClick={() => answer(2)}>
                <span className="answer-label">
                  Almost <kbd>2</kbd>
                </span>
                <span className="answer-hint">Comes back in 5 minutes</span>
              </button>
              <button type="button" className="answer-btn" onClick={() => answer(3)}>
                <span className="answer-label">
                  Didn't understand <kbd>3</kbd>
                </span>
                <span className="answer-hint">Comes back after a few cards</span>
              </button>
            </div>
          )}
          {(canHint || (!flipped && type !== 'occlusion')) && (
            <div className="hint-row">
              <button type="button" className="btn btn-quiet btn-sm hint-btn" onClick={hint} disabled={!canHint}>
                <Lightbulb size={14} aria-hidden="true" />
                {isMcq ? 'Rule out a wrong answer' : hintLevel === 0 ? 'Show a hint' : 'Show more'} {!isTypein && <kbd>H</kbd>}
              </button>
            </div>
          )}
        </div>

        <StickyNotes cardId={current.card.id} scope={deckId ?? 'all'} open={notesOpen} onOpenChange={setNotesOpen} />
      </div>
    </div>
  );
}
