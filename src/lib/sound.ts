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

/** A soft, short "whoosh" as a study card turns over (same switches as the ding). */
export function whoosh() {
  if (!getSettings().ding || getSettings().noFluff) return;
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime;
  const dur = 0.25;
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  const noise = a.createBufferSource();
  noise.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(350, t0);
  filter.frequency.exponentialRampToValueAtTime(1600, t0 + dur);
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.09);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  noise.connect(filter).connect(gain).connect(a.destination);
  noise.start(t0);
  noise.stop(t0 + dur);
}
