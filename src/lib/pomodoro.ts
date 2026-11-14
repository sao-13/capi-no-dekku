import { useSyncExternalStore } from 'react';

export type Phase = 'focus' | 'break';

export type TimerState =
  | { status: 'idle' }
  | { status: 'running'; phase: Phase; durationMs: number; endAt: number }
  | { status: 'paused'; phase: Phase; durationMs: number; remainingMs: number }
  | { status: 'done'; phase: Phase; messageIndex: number };

const KEY = 'margin:pomodoro';

function load(): TimerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { status: 'idle' };
    const s = JSON.parse(raw) as TimerState;
    // A timer that ran out while the tab was closed finishes now.
    if (s.status === 'running' && s.endAt <= Date.now()) return { status: 'done', phase: s.phase, messageIndex: pickMessage(s.phase) };
    return s;
  } catch {
    return { status: 'idle' };
  }
}

let state: TimerState = load();
const listeners = new Set<() => void>();

function set(next: TimerState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // The timer still works for this visit.
  }
  listeners.forEach((l) => l());
}

export const useTimer = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

export const getTimer = () => state;

export const startTimer = (minutes: number, phase: Phase = 'focus') =>
  set({ status: 'running', phase, durationMs: minutes * 60_000, endAt: Date.now() + minutes * 60_000 });

export function pauseTimer() {
  if (state.status !== 'running') return;
  set({ status: 'paused', phase: state.phase, durationMs: state.durationMs, remainingMs: Math.max(0, state.endAt - Date.now()) });
}

export function resumeTimer() {
  if (state.status !== 'paused') return;
  set({ status: 'running', phase: state.phase, durationMs: state.durationMs, endAt: Date.now() + state.remainingMs });
}

export const stopTimer = () => set({ status: 'idle' });

export function finishTimer() {
  if (state.status !== 'running') return;
  set({ status: 'done', phase: state.phase, messageIndex: pickMessage(state.phase) });
}

export interface DoneMessage {
  title: string;
  /** Reading or translation for Japanese titles; a follow-up line for English ones. */
  line: string;
  lang?: 'ja';
}

export const FOCUS_DONE: DoneMessage[] = [
  { title: 'Good job! Take a rest.', line: 'Stand up, stretch, and look at something far away for a minute.' },
  { title: 'お疲れさまでした！', line: 'Otsukaresama deshita — thank you for your hard work. Time for a break.', lang: 'ja' },
  { title: 'よくできました！', line: 'Yoku dekimashita — nicely done. Rest your eyes for a bit.', lang: 'ja' },
  { title: 'That’s a full session.', line: 'Get some water. The cards will still be here in five minutes.' },
  { title: 'ひと休みしましょう', line: 'Hitoyasumi shimashō — let’s take a short rest.', lang: 'ja' },
  { title: 'Well earned. Step away for a bit.', line: 'A short break now makes the next round stick better.' },
];

export const BREAK_DONE: DoneMessage[] = [
  { title: 'Break’s over.', line: 'Ready when you are. One more round?' },
  { title: 'さあ、始めましょう！', line: 'Saa, hajimemashō — let’s get started again.', lang: 'ja' },
  { title: '頑張って！', line: 'Ganbatte — you’ve got this.', lang: 'ja' },
  { title: 'Back to it.', line: 'Pick up where you left off.' },
];

function pickMessage(phase: Phase) {
  const list = phase === 'focus' ? FOCUS_DONE : BREAK_DONE;
  return Math.floor(Math.random() * list.length);
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** A soft two-note chime, made on the fly so there's no audio file to load. */
export function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.28;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.2);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch {
    // Sound is a nicety; the visual message still appears.
  }
}
