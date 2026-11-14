import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, Check, FolderOpen, KeyRound, ListChecks, RotateCcw, X } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { answerStudy, useData } from '../lib/store';
import { describeInterval, itemsOf, nextDueDay, nextIntervalDays, typeOf, TYPE_LABEL, type Item } from '../lib/srs';
import { faces } from '../components/CardContent';
import { RichText } from '../components/RichText';
import { OcclusionView } from '../components/OcclusionView';
import { clozeAnswer, plainText } from '../lib/markup';
import { shuffle } from '../lib/quiz';
import { spendKey, useKeys } from '../lib/keys';
import { useSessionCheers } from '../lib/useSessionCheers';
import { Notebook, useNotebookOpen } from '../components/Notebook';
import '../components/Notebook.css';
import { formatRelativeDay, plural, todayKey } from '../lib/dates';
import type { AppData, DayKey } from '../lib/types';
import './Study.css';

const NEW_PER_SESSION = 20;

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
  const keys = useKeys();
  const [hintLevel, setHintLevel] = useState(0);
  const [ruledOut, setRuledOut] = useState<Set<number>>(new Set());
  const [chosen, setChosen] = useState<number | null>(null);
  const [notebookOpen, setNotebookOpen] = useNotebookOpen();
  const finishedAnnounced = useRef(false);

  const restart = useCallback(
    (studyAhead: boolean) => {
      setQueue(buildQueue(data, deckId, todayKey(), studyAhead));
      setPosition(0);
      setFlipped(false);
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

  const flip = useCallback(() => {
    setFlipped(true);
    requestAnimationFrame(() => answerRef.current?.focus({ preventScroll: true }));
  }, []);

  const answer = useCallback(
    (knewIt: boolean) => {
      if (!current || !flipped) return;
      // Gizmo Style answers are cheered when chosen; the rest when rated.
      if (!isMcq) cheers.record(knewIt);
      answerStudy(current.card.id, current.variant, knewIt);
      setTally((t) => {
        const firstTry = new Map(t.firstTry);
        if (!firstTry.has(current.key)) firstTry.set(current.key, knewIt);
        return { firstTry, answers: t.answers + 1 };
      });
      if (!knewIt) setQueue((q) => [...q, current.key]);
      cheers.progress((position + 1) / (liveQueue.length + (knewIt ? 0 : 1)));
      setFlipped(false);
      setHintLevel(0);
      setRuledOut(new Set());
      setChosen(null);
      setPosition((p) => p + 1);
      requestAnimationFrame(() => stageRef.current?.focus({ preventScroll: true }));
    },
    [current, flipped, isMcq, cheers, position, liveQueue.length],
  );

  const choose = useCallback(
    (i: number) => {
      if (!current || chosen !== null || ruledOut.has(i)) return;
      setChosen(i);
      setFlipped(true);
      cheers.record(options[i] === current.card.back);
      requestAnimationFrame(() => answerRef.current?.querySelector<HTMLButtonElement>('.mcq-next')?.focus());
    },
    [current, chosen, ruledOut, options, cheers],
  );

  const hint = useCallback(() => {
    if (!current || flipped) return;
    if (isMcq) {
      const wrongIdx = options.map((o, i) => (o === current.card.back || ruledOut.has(i) ? -1 : i)).filter((i) => i >= 0);
      if (wrongIdx.length <= 1) return;
      if (spendKey()) setRuledOut((r) => new Set(r).add(wrongIdx[Math.floor(Math.random() * wrongIdx.length)]));
      return;
    }
    if (hintLevel >= 2) return;
    if (spendKey()) setHintLevel((l) => l + 1);
  }, [current, flipped, isMcq, options, ruledOut, hintLevel]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, dialog')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!current) return;
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
          answer(options[chosen] === current.card.back);
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
      } else if (flipped && e.key === '1') {
        e.preventDefault();
        answer(false);
      } else if (flipped && e.key === '2') {
        e.preventDefault();
        answer(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, flipped, flip, answer, isMcq, options, choose, chosen, hint]);

  const backTo = deck ? `/decks/${deck.id}` : '/';
  const backLabel = deck ? deck.name : 'Today';

  if (deckId && !deck) {
    return (
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
    );
  }

  const pool = data.cards.filter((c) => !deckId || c.deckId === deckId);

  if (liveQueue.length === 0) {
    if (pool.length === 0) {
      return (
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
      );
    }
    const nextDue = pool.map(nextDueDay).sort()[0];
    const nextCount = pool.flatMap(itemsOf).filter((i) => i.srs.due === nextDue).length;
    return (
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
    );
  }

  if (finished) {
    const firstTryKnown = [...tally.firstTry.values()].filter(Boolean).length;
    const unique = tally.firstTry.size;
    const upcoming = pool.flatMap(itemsOf).filter((i) => i.srs.due > today);
    const nextDue = upcoming.map((i) => i.srs.due).sort()[0];
    const nextCount = nextDue ? upcoming.filter((i) => i.srs.due === nextDue).length : 0;
    return (
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
    );
  }

  if (!current) return null;

  const remaining = liveQueue.length - position;
  const progress = (position / liveQueue.length) * 100;
  const cardDeck = deck ?? data.decks.find((d) => d.id === current.card.deckId);
  const { question, answer: answerText, extra } = faces(current.card, current.variant);
  const occlusion = typeOf(current.card) === 'occlusion' ? current.card.occlusion : undefined;
  const spoken = (t: string) => plainText(t) || 'Image card';
  const type = typeOf(current.card);
  const hintSource =
    type === 'cloze' ? plainText(clozeAnswer(current.card.front, Number(current.variant.slice(1)) || 1)) : plainText(answerText);
  const canHint = !flipped && type !== 'occlusion' && (isMcq ? options.length - 1 - ruledOut.size > 1 : hintLevel < 2);
  const mcqRight = chosen !== null && options[chosen] === current.card.back;

  return (
    <div className={`with-notebook${notebookOpen ? ' is-open' : ''}`}>
    <div className="study" key={sessionKey}>
      <header className="study-head">
        <Link to={backTo} className="breadcrumb">
          <ArrowLeft size={16} aria-hidden="true" />
          End session
        </Link>
        <p className="study-count" aria-live="off">
          {plural(remaining, 'card')} left
          {tally.firstTry.size > 0 && (
            <span className="serious-only">
              {', '}
              {Math.round(([...tally.firstTry.values()].filter(Boolean).length / tally.firstTry.size) * 100)}% right first try
            </span>
          )}
        </p>
      </header>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Session progress"
        aria-valuemin={0}
        aria-valuemax={liveQueue.length}
        aria-valuenow={position}
      >
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      {cheers.gain && (
        <span key={cheers.gain.id} className="xp-float" aria-hidden="true">
          +{cheers.gain.amount} EXP
        </span>
      )}

      <div className="study-stage" ref={stageRef} tabIndex={-1} aria-label="Flashcard">
        <p className="visually-hidden" aria-live="polite">
          {flipped
            ? `Answer: ${spoken(answerText)}${extra ? `. ${plainText(extra)}` : ''}`
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
                {answerText && <RichText text={answerText} as="div" />}
                {occlusion && <OcclusionView occlusion={occlusion} active={current.variant} revealed />}
                {extra && <RichText text={extra} as="div" className="index-extra" />}
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
              <button type="button" className="btn btn-primary mcq-next" onClick={() => answer(mcqRight)}>
                Next card <kbd>Enter</kbd>
              </button>
            </div>
          )
        ) : !flipped ? (
          <button type="button" className="btn btn-lg study-reveal" onClick={flip}>
            Show answer <kbd>Space</kbd>
          </button>
        ) : (
          <div className="study-answers" role="group" aria-label="How did you do?">
            <button type="button" className="answer-btn" onClick={() => answer(false)}>
              <span className="answer-label">
                Again <kbd>1</kbd>
              </span>
              <span className="answer-hint">Comes back later this session</span>
            </button>
            <button type="button" className="answer-btn is-good" onClick={() => answer(true)}>
              <span className="answer-label">
                Knew it <kbd>2</kbd>
              </span>
              <span className="answer-hint">Next review {describeInterval(nextIntervalDays(current.srs))}</span>
            </button>
          </div>
        )}
        {(canHint || (!flipped && type !== 'occlusion')) && (
          <div className="hint-row">
            <button type="button" className="btn btn-quiet btn-sm hint-btn" onClick={hint} disabled={!canHint}>
              <KeyRound size={14} aria-hidden="true" />
              {isMcq ? 'Rule out a wrong answer' : hintLevel === 0 ? 'Show a hint' : 'Show more'} <kbd>H</kbd>
            </button>
            <span className="keys-left" title="Each hint uses one key">
              <KeyRound size={13} aria-hidden="true" /> {keys} {keys === 1 ? 'key' : 'keys'} left
            </span>
          </div>
        )}
      </div>
    </div>
      <Notebook
        scope={deckId ?? 'all'}
        open={notebookOpen}
        onOpenChange={setNotebookOpen}
        current={{ question: plainText(question) || 'Image card', answer: plainText(answerText) || 'see image' }}
      />
    </div>
  );
}
