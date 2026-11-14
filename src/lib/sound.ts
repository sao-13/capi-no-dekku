import { getSettings } from './settings';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** A bright, short "ding" for a correct answer (when the Ding option is on). */
export function ding() {
  if (!getSettings().ding || getSettings().noFluff) return;
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime;
  [
    [1046.5, 0],
    [1568, 0.07],
  ].forEach(([freq, delay]) => {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t = t0 + delay;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.16, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + 0.6);
  });
}
