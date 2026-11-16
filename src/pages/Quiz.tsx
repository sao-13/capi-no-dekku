import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, FolderOpen, Lightbulb, ListChecks, Play, RotateCcw, X } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { recordQuiz, useData } from '../lib/store';
import { buildQuiz, canQuiz, shuffle, type Question } from '../lib/quiz';
import { plural } from '../lib/dates';
import type { Card } from '../lib/types';
import { RichText } from '../components/RichText';
import { SessionBar } from '../components/SessionBar';
import { StickyNotes } from '../components/StickyNotes';
import { setNotesOpen, useCardNote, useNotesOpen } from '../lib/notes';
import { useSessionCheers } from '../lib/useSessionCheers';
import { clozeAnswer, clozeNumbers, clozeQuestion } from '../lib/markup';
import { typeOf } from '../lib/srs';
import './Quiz.css';

function asQuizCard(card: Card): Card[] {
  const type = typeOf(card);
  if (type === 'occlusion') return [];
  if (type === 'cloze') {
    const [n] = clozeNumbers(card.front);
    return n ? [{ ...card, front: clozeQuestion(card.front, n), back: clozeAnswer(card.front, n) }] : [];
  }
  return [card];
}

type Phase = 'setup' | 'asking' | 'done';

interface Answer {
  question: Question;
  chosen: number;
  correct: boolean;
}

export function Quiz() {
  const { deckId = '' } = useParams();
  const data = useData();
  const deck = data.decks.find((d) => d.id === deckId);
  // Quizzable versions of the deck's cards: image cards are left out, cloze cards ask their first deletion.
  const cards = useMemo(() => data.cards.filter((c) => c.deckId === deckId).flatMap(asQuizCard), [data.cards, deckId]);
  const otherBacks = useMemo(() => data.cards.filter((c) => c.deckId !== deckId).flatMap(asQuizCard).map((c) => c.back), [data.cards, deckId]);

  const [phase, setPhase] = useState<Phase>('setup');
  const [length, setLength] = useState<number>(() => Math.min(10, cards.length));
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [ruledOut, setRuledOut] = useState<Set<number>>(new Set());
  const [answers, setAnswers] = useState<Answer[]>([]);
  const nextRef = useRef<HTMLButtonElement>(null);
  const cheers = useSessionCheers();
  const notesOpen = useNotesOpen();
  const questionRef = useRef<HTMLHeadingElement>(null);

  const start = useCallback(
    (pool: Card[], count: number) => {
      setQuestions(buildQuiz(pool, [...otherBacks, ...cards.map((c) => c.back)], count));
      setIndex(0);
      setChosen(null);
      setRuledOut(new Set());
      setAnswers([]);
      setPhase('asking');
      cheers.reset();
      requestAnimationFrame(() => questionRef.current?.focus());
    },
    [cards, otherBacks, cheers],
  );

  const question = questions[index];
  const currentNote = useCardNote(question?.card.id ?? '');

  const choose = useCallback(
    (option: number) => {
      if (!question || chosen !== null || ruledOut.has(option)) return;
      setChosen(option);
      cheers.record(option === question.answerIndex);
      setAnswers((a) => [...a, { question, chosen: option, correct: option === question.answerIndex }]);
      requestAnimationFrame(() => nextRef.current?.focus());
    },
    [question, chosen, ruledOut, cheers],
  );

  const ruleOut = useCallback(() => {
    if (!question || chosen !== null) return;
    const wrong = question.options.map((_, i) => i).filter((i) => i !== question.answerIndex && !ruledOut.has(i));
    if (wrong.length <= 1) return;
    setRuledOut((r) => new Set(r).add(shuffle(wrong)[0]));
  }, [question, chosen, ruledOut]);

  const next = useCallback(() => {
    if (chosen === null) return;
    if (index + 1 >= questions.length) {
      recordQuiz(deckId, answers.map((a) => ({ cardId: a.question.card.id, correct: a.correct })));
      setPhase('done');
      cheers.finished();
      return;
    }
    cheers.progress((index + 1) / questions.length);
    setIndex((i) => i + 1);
    setChosen(null);
    setRuledOut(new Set());
    requestAnimationFrame(() => questionRef.current?.focus());
  }, [chosen, index, questions.length, answers, deckId, cheers]);

  useEffect(() => {
    if (phase !== 'asking') return;
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= (question?.options.length ?? 0)) {
        e.preventDefault();
        choose(n - 1);
      } else if (e.key.toLowerCase() === 'h') {
        e.preventDefault();
        ruleOut();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, question, choose, ruleOut]);

  if (!deck) {
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
            It may have been deleted. Pick another deck to quiz yourself on.
          </EmptyState>
        </div>
      </div>
    );
  }

  if (!canQuiz(cards, otherBacks)) {
    return (
      <div className="sheet">
        <div className="page">
          <EmptyState
            icon={ListChecks}
            title="A quiz needs at least two cards"
            headingLevel="h1"
            actions={
              <Link to={`/decks/${deck.id}`} className="btn btn-primary">
                Add cards to {deck.name}
              </Link>
            }
          >
            Each question offers other cards' answers as the wrong choices, so there has to be more than one answer to
            choose from. {cards.length === 1 ? 'This deck has one card.' : "This deck doesn't have any cards yet."}
          </EmptyState>
        </div>
      </div>
    );
  }

  const back = (
    <Link to={`/decks/${deck.id}`} className="breadcrumb">
      <ArrowLeft size={16} aria-hidden="true" />
      {deck.name}
    </Link>
  );

  if (phase === 'setup') {
    const lengths = [...new Set([5, 10, 20].filter((n) => n < cards.length).concat(cards.length))];
    return (
      <div className="sheet">
        <div className="page quiz">
          <header className="page-head">
            {back}
            <h1>Quiz on {deck.name}</h1>
            <p className="page-lede">
              Pick the right answer for each card. Hearts never run out. Hints rule out a wrong answer.
            </p>
          </header>
          <form
            className="quiz-setup"
            onSubmit={(e) => {
              e.preventDefault();
              start(cards, length);
            }}
          >
            <fieldset className="choice-group">
              <legend className="field-label">How many questions?</legend>
              <div className="choice-row">
                {lengths.map((n) => (
                  <label key={n} className="choice">
                    <input type="radio" name="length" value={n} checked={length === n} onChange={() => setLength(n)} />
                    <span>{n === cards.length ? `All ${n}` : n}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <button type="submit" className="btn btn-primary btn-lg">
                <Play size={16} aria-hidden="true" />
                Start quiz
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    const right = answers.filter((a) => a.correct).length;
    const missed = answers.filter((a) => !a.correct);
    const pct = Math.round((right / answers.length) * 100);
    return (
      <div className="sheet">
        <div className="page quiz">
          <header className="page-head">
            {back}
            <h1>
              {right} of {answers.length} right
            </h1>
            <p className="page-lede">
              {missed.length === 0
                ? `A clean sheet: every answer right on ${deck.name}.`
                : `${pct}% on this run. The ${missed.length === 1 ? 'one you missed is' : `${missed.length} you missed are`} listed below with the right answer.`}
            </p>
          </header>

          <div className="score-bar" aria-hidden="true">
            {answers.map((a, i) => (
              <span key={i} className={a.correct ? 'is-right' : 'is-wrong'} />
            ))}
          </div>

          <div className="btn-row">
            {missed.length > 0 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => start(
                  missed.map((m) => m.question.card),
                  missed.length,
                )}
              >
                <RotateCcw size={16} aria-hidden="true" />
                Retry the {missed.length === 1 ? 'one' : missed.length} you missed
              </button>
            )}
            <button type="button" className={`btn${missed.length ? '' : ' btn-primary'}`} onClick={() => start(cards, length)}>
              New quiz
            </button>
            <Link to={`/decks/${deck.id}/study`} className="btn">
              Study {deck.name}
            </Link>
          </div>

          {missed.length > 0 && (
            <section className="section" aria-labelledby="missed-heading">
              <div className="section-head">
                <h2 id="missed-heading">To go over</h2>
              </div>
              <ul className="missed-list">
                {missed.map((m) => (
                  <li key={m.question.card.id}>
                    <RichText as="p" className="missed-q" text={m.question.card.front} />
                    <p className="missed-right">
                      <Check size={16} aria-hidden="true" />
                      <span>
                        <span className="visually-hidden">Right answer: </span>
                        <RichText text={m.question.card.back} />
                      </span>
                    </p>
                    <p className="missed-yours">
                      <X size={16} aria-hidden="true" />
                      <span>
                        <span className="visually-hidden">You chose: </span>
                        <RichText text={m.question.options[m.chosen]} />
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    );
  }

  if (!question) return null;
  const answered = chosen !== null;
  const wasRight = answered && chosen === question.answerIndex;
  const remainingWrong = question.options.length - 1 - ruledOut.size;
  const score = answers.filter((a) => a.correct).length;

  return (
    <div className="quiz quiz-asking">
      <SessionBar
        backTo={`/decks/${deck.id}`}
        backLabel={`Leave quiz, back to ${deck.name}`}
        title={deck.name}
        progress={{ value: index + (answered ? 1 : 0), max: questions.length, label: 'Quiz progress' }}
        left={`Question ${index + 1} of ${questions.length}`}
        earned={cheers.earned}
        gain={cheers.gain}
        notes={{ open: notesOpen, hasNote: currentNote.trim() !== '', onToggle: () => setNotesOpen(!notesOpen) }}
      />

      <div className="sticky-host">
        <div className="quiz-card">
          <h1 className="quiz-question" ref={questionRef} tabIndex={-1}>
            <RichText text={question.card.front} />
          </h1>
        </div>

        <OptionList
          question={question}
          chosen={chosen}
          ruledOut={ruledOut}
          onChoose={choose}
        />

        <div className="quiz-foot">
          {!answered ? (
            <>
              <button type="button" className="btn btn-quiet" onClick={ruleOut} disabled={remainingWrong <= 1}>
                <Lightbulb size={16} aria-hidden="true" />
                Rule out a wrong answer <kbd>H</kbd>
              </button>
              <p className="field-hint">Press 1 to {question.options.length} to answer.</p>
            </>
          ) : (
            <>
              <p className={`quiz-feedback ${wasRight ? 'is-right' : 'is-wrong'}`} role="status">
                {wasRight ? (
                  <>
                    <Check size={18} aria-hidden="true" /> Right. {score} so far.
                  </>
                ) : (
                  <>
                    <X size={18} aria-hidden="true" /> Not this one. The right answer is marked.
                  </>
                )}
              </p>
              <button type="button" className="btn btn-primary" ref={nextRef} onClick={next}>
                {index + 1 >= questions.length ? 'See results' : 'Next question'} <kbd>Enter</kbd>
              </button>
            </>
          )}
        </div>

        <StickyNotes cardId={question.card.id} scope={deckId} open={notesOpen} onOpenChange={setNotesOpen} />
      </div>
    </div>
  );
}

function OptionList({
  question,
  chosen,
  ruledOut,
  onChoose,
}: {
  question: Question;
  chosen: number | null;
  ruledOut: Set<number>;
  onChoose: (i: number) => void;
}) {
  const answered = chosen !== null;
  return (
    <ol className="options" aria-label={`Answer, ${plural(question.options.length, 'option')}`}>
      {question.options.map((option, i) => {
        const isAnswer = i === question.answerIndex;
        const isChosen = i === chosen;
        const out = ruledOut.has(i);
        let state = '';
        if (answered && isAnswer) state = 'is-answer';
        else if (answered && isChosen) state = 'is-wrong';
        else if (out) state = 'is-out';
        return (
          <li key={i}>
            <button
              type="button"
              className={`option ${state}`}
              onClick={() => onChoose(i)}
              disabled={out || (answered && !isAnswer && !isChosen)}
              aria-disabled={answered || out ? true : undefined}
            >
              <span className="option-key" aria-hidden="true">
                {i + 1}
              </span>
              <RichText className="option-text" text={option} />
              {answered && isAnswer && (
                <span className="option-mark">
                  <Check size={16} aria-hidden="true" />
                  {isChosen ? 'Your answer' : 'Right answer'}
                </span>
              )}
              {answered && isChosen && !isAnswer && (
                <span className="option-mark">
                  <X size={16} aria-hidden="true" />
                  Your answer
                </span>
              )}
              {out && !answered && <span className="option-mark">Ruled out</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
