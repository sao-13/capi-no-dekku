import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Coffee, Pause, Play, Timer, X } from 'lucide-react';
import {
  BREAK_DONE,
  chime,
  FOCUS_DONE,
  finishTimer,
  formatClock,
  pauseTimer,
  resumeTimer,
  startTimer,
  stopTimer,
  useTimer,
  type Phase,
} from '../lib/pomodoro';
import { useSettings } from '../lib/settings';
import './Pomodoro.css';

const PRESETS: Record<Phase, number[]> = { focus: [15, 25, 45, 60], break: [5, 10, 15] };
const LAST_KEY = 'margin:pomodoro:last';

function lastMinutes(phase: Phase): number {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as Partial<Record<Phase, number>>;
    return saved[phase] ?? (phase === 'focus' ? 25 : 5);
  } catch {
    return phase === 'focus' ? 25 : 5;
  }
}

function rememberMinutes(phase: Phase, minutes: number) {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}');
    localStorage.setItem(LAST_KEY, JSON.stringify({ ...saved, [phase]: minutes }));
  } catch {
    // Not remembered, but the timer still starts.
  }
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Where the timer should fly in from when it starts (the Start button's position). */
let launchFrom: DOMRect | null = null;

/** Header button + setup panel. The running timer floats over the page (see FloatingTimer). */
/** Ask whichever timer button is on screen to open its setup panel (e.g. from the tomato doodle). */
export const openTimerPanel = () => window.dispatchEvent(new Event('capi:open-timer'));

export function Pomodoro({ variant = 'icon' }: { variant?: 'icon' | 'sidebar' }) {
  const timer = useTimer();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('focus');
  const [minutes, setMinutes] = useState(() => lastMinutes('focus'));
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onOpen = () => {
      // Only the button that's actually visible (sidebar on desktop, top bar on phones) responds.
      if (buttonRef.current?.offsetParent) setOpen(true);
    };
    window.addEventListener('capi:open-timer', onOpen);
    return () => window.removeEventListener('capi:open-timer', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function start() {
    const m = Math.max(1, Math.min(180, Math.round(minutes) || 1));
    launchFrom = startRef.current?.getBoundingClientRect() ?? null;
    rememberMinutes(phase, m);
    startTimer(m, phase);
    setOpen(false);
  }

  const active = timer.status === 'running' || timer.status === 'paused';

  return (
    <div className="pomo">
      <button
        ref={buttonRef}
        type="button"
        className={`${variant === 'sidebar' ? 'side-link' : 'icon-btn'} pomo-trigger${active ? ' is-active' : ''}`}
        aria-label={variant === 'icon' ? (active ? 'Focus timer (running)' : 'Focus timer') : undefined}
        title="Focus timer"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <Timer size={18} aria-hidden="true" />
        {variant === 'sidebar' && <span>Focus timer{active ? <span className="pomo-running"> running</span> : null}</span>}
      </button>

      {open && (
        <div ref={panelRef} id={panelId} className={`pomo-panel is-${variant}`} role="dialog" aria-label="Focus timer">
          <p className="pomo-panel-title">Focus timer</p>
          <div className="segmented" role="group" aria-label="Kind of timer">
            {(['focus', 'break'] as const).map((p) => (
              <button
                key={p}
                type="button"
                className="segmented-option"
                aria-pressed={phase === p}
                onClick={() => {
                  setPhase(p);
                  setMinutes(lastMinutes(p));
                }}
              >
                {p === 'focus' ? 'Focus' : 'Break'}
              </button>
            ))}
          </div>
          <fieldset className="chip-group">
            <legend className="visually-hidden">Length</legend>
            {PRESETS[phase].map((m) => (
              <label key={m} className="chip">
                <input type="radio" name="pomo-len" checked={minutes === m} onChange={() => setMinutes(m)} />
                <span>{m} min</span>
              </label>
            ))}
          </fieldset>
          <label className="pomo-custom">
            <span>Minutes</span>
            <input
              className="input"
              type="number"
              min={1}
              max={180}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && start()}
            />
          </label>
          <button ref={startRef} type="button" className="btn btn-primary" onClick={start}>
            {phase === 'focus' ? <Timer size={16} aria-hidden="true" /> : <Coffee size={16} aria-hidden="true" />}
            {active ? 'Restart' : 'Start'} {phase === 'focus' ? 'focusing' : 'break'}
          </button>
        </div>
      )}

    </div>
  );
}

/** Render once, in the layout: the timer that floats over the page. */
export function TimerHost() {
  const timer = useTimer();
  return timer.status === 'idle' ? null : createPortal(<FloatingTimer />, document.body);
}

function FloatingTimer() {
  const timer = useTimer();
  const { noFluff } = useSettings();
  const [now, setNow] = useState(() => Date.now());
  const innerRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const wasRunning = useRef(timer.status === 'running');

  // Tick while running, and finish at zero.
  useEffect(() => {
    if (timer.status !== 'running') return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= timer.endAt) {
        finishTimer();
        chime();
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [timer]);

  // Fly in from the Start button to the top of the screen.
  useLayoutEffect(() => {
    const el = innerRef.current;
    const from = launchFrom;
    launchFrom = null;
    if (!el || !from || reducedMotion()) return;
    const to = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, opacity: 0.3 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 600, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
    // Only on mount and on (re)start.
  }, [timer.status === 'running' && timer.endAt]);

  // Title countdown, and focus the message when the timer finishes.
  const remaining =
    timer.status === 'running' ? timer.endAt - now : timer.status === 'paused' ? timer.remainingMs : 0;
  useEffect(() => {
    const base = 'Capi’s Deck';
    if (timer.status === 'running' || timer.status === 'paused') {
      document.title = `${formatClock(remaining)} ${timer.phase === 'focus' ? 'focus' : 'break'} – ${base}`;
    } else if (timer.status === 'done') {
      document.title = `${timer.phase === 'focus' ? 'Time for a break' : 'Break’s over'} – ${base}`;
    }
    return () => {
      document.title = base;
    };
  }, [timer, remaining]);

  useEffect(() => {
    if (timer.status === 'done') {
      const t = window.setTimeout(() => primaryRef.current?.focus(), wasRunning.current ? 650 : 0);
      wasRunning.current = false;
      const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stopTimer();
      document.addEventListener('keydown', onKey);
      return () => {
        window.clearTimeout(t);
        document.removeEventListener('keydown', onKey);
      };
    }
    wasRunning.current = true;
  }, [timer.status]);

  if (timer.status === 'idle') return null;

  const done = timer.status === 'done';
  const ending = timer.status === 'running' && remaining <= 60_000;
  const progress = timer.status === 'done' ? 1 : 1 - remaining / timer.durationMs;
  const msg = !done
    ? null
    : noFluff
      ? timer.phase === 'focus'
        ? { title: 'Focus session complete.', line: 'Take a short break before the next one.', lang: undefined }
        : { title: 'Break over.', line: 'Ready for the next focus session.', lang: undefined }
      : (timer.phase === 'focus' ? FOCUS_DONE : BREAK_DONE)[timer.messageIndex % (timer.phase === 'focus' ? FOCUS_DONE : BREAK_DONE).length];

  // One positioner element for every state, so finishing glides it from the top to the middle.
  return (
    <>
      {done ? <div className="pomo-backdrop" onClick={stopTimer} aria-hidden="true" /> : null}
      <div className={`pomo-float${done ? ' is-center' : ''}`}>
        {done && msg ? (
          <div ref={innerRef} className="pomo-done" role="alertdialog" aria-modal="true" aria-labelledby="pomo-done-title" aria-describedby="pomo-done-line">
            <span className="pomo-done-icon" aria-hidden="true">
              {timer.phase === 'focus' ? <Coffee size={22} /> : <Timer size={22} />}
            </span>
            <h2 id="pomo-done-title" className="pomo-done-title" lang={msg.lang}>
              {msg.title}
            </h2>
            <p id="pomo-done-line" className="pomo-done-line">
              {msg.line}
            </p>
            <div className="btn-row pomo-done-actions">
              {timer.phase === 'focus' ? (
                <>
                  <button ref={primaryRef} type="button" className="btn btn-primary" onClick={() => startTimer(lastMinutes('break'), 'break')}>
                    <Coffee size={16} aria-hidden="true" />
                    Take a {lastMinutes('break')}-minute break
                  </button>
                  <button type="button" className="btn" onClick={() => startTimer(lastMinutes('focus'), 'focus')}>
                    Another {lastMinutes('focus')} minutes
                  </button>
                </>
              ) : (
                <button ref={primaryRef} type="button" className="btn btn-primary" onClick={() => startTimer(lastMinutes('focus'), 'focus')}>
                  <Timer size={16} aria-hidden="true" />
                  Focus for {lastMinutes('focus')} minutes
                </button>
              )}
              <button type="button" className="btn btn-quiet" onClick={stopTimer}>
                Close
              </button>
            </div>
          </div>
        ) : timer.status === 'running' || timer.status === 'paused' ? (
          <div
            ref={innerRef}
            className={`pomo-pill${ending ? ' is-ending' : ''}${timer.status === 'paused' ? ' is-paused' : ''}${timer.phase === 'break' ? ' is-break' : ''}`}
            role="timer"
            aria-label={`${timer.phase === 'focus' ? 'Focus' : 'Break'} timer, ${formatClock(remaining)} left${timer.status === 'paused' ? ', paused' : ''}`}
          >
            <span className="pomo-pill-progress" style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }} aria-hidden="true" />
            {timer.phase === 'focus' ? <Timer size={16} aria-hidden="true" /> : <Coffee size={16} aria-hidden="true" />}
            <span className="pomo-pill-label" aria-hidden="true">
              {timer.status === 'paused' ? 'Paused' : timer.phase === 'focus' ? 'Focus' : 'Break'}
            </span>
            <span className="pomo-pill-time" aria-hidden="true">
              {formatClock(remaining)}
            </span>
            {timer.status === 'running' ? (
              <button type="button" className="pomo-pill-btn" onClick={pauseTimer} aria-label="Pause timer" title="Pause">
                <Pause size={14} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="pomo-pill-btn" onClick={resumeTimer} aria-label="Resume timer" title="Resume">
                <Play size={14} aria-hidden="true" />
              </button>
            )}
            <button type="button" className="pomo-pill-btn" onClick={stopTimer} aria-label="Stop timer" title="Stop">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
