import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { CAPI_DROPPED, CAPI_LANDED, CAPI_POKED, CAPI_THROWN, CAPI_WOKEN } from '../content/messages';
import { useSettings } from '../lib/settings';
import { PixelSprite } from './Doodles';
import './Capi.css';

/*
  Capi the capybara: a tiny, very sleepy desktop pet. He wanders the bottom of the page, dozes off a lot,
  wakes up startled when clicked, and can be dragged onto the top edge of any block to walk along it.
*/

const BODY = {
  walk1: [
    '...............kk.......',
    '..............kddk......',
    '........kkkkkkkbbbkkk...',
    '......kkllllllbbbbbbbkk.',
    '.....kbllbbbbbbbbbbebbbk',
    '....kblbbbbbbbbbbbbbbbbk',
    '...kbbbbbbbbbbbbbbbbbbsk',
    '..kbbbbbbbbbbbbbbbbpbssk',
    '..kbbbbbbbbbbbbdbbbbbsnk',
    '..kbbbbbbbbbbbbdbbbbbssk',
    '..kdbbbbbbbbbbbbdbbbkkk.',
    '..kddbbbbbbbbbbbbbbbk...',
    '...kdddbbbbbbbbbbbddk...',
    '....kkddddddddddddkk....',
    '....kfk..kfk..kfk.kfk...',
    '....kk...kk...kk..kk....',
  ],
  walk2: [
    '...............kk.......',
    '..............kddk......',
    '........kkkkkkkbbbkkk...',
    '......kkllllllbbbbbbbkk.',
    '.....kbllbbbbbbbbbbebbbk',
    '....kblbbbbbbbbbbbbbbbbk',
    '...kbbbbbbbbbbbbbbbbbbsk',
    '..kbbbbbbbbbbbbbbbbpbssk',
    '..kbbbbbbbbbbbbdbbbbbsnk',
    '..kbbbbbbbbbbbbdbbbbbssk',
    '..kdbbbbbbbbbbbbdbbbkkk.',
    '..kddbbbbbbbbbbbbbbbk...',
    '...kdddbbbbbbbbbbbddk...',
    '....kkddddddddddddkk....',
    '.....kfk.kfk...kfkkfk...',
    '.....kk..kk....kk.kk....',
  ],
  sleep: [
    '........................',
    '........................',
    '...............kk.......',
    '..............kddk......',
    '........kkkkkkkbbbkkk...',
    '......kkllllllbbbbbbbkk.',
    '.....kbllbbbbbbbbbbbbbbk',
    '....kblbbbbbbbbbbbbkkbbk',
    '...kbbbbbbbbbbbbbbbbbbsk',
    '..kbbbbbbbbbbbbbbbbpbssk',
    '..kbbbbbbbbbbbbdbbbbbsnk',
    '..kdbbbbbbbbbbbdbbbbbssk',
    '..kddbbbbbbbbbbbdbbbkkk.',
    '...kdddbbbbbbbbbbbbbk...',
    '....kkkfkkkkkkkkkfkkk...',
    '........................',
  ],
  startled: [
    '...............kk.......',
    '..............kddk......',
    '........kkkkkkkbbbkkk...',
    '......kkllllllbbbbbbbkk.',
    '.....kbllbbbbbbbbbwwbbbk',
    '....kblbbbbbbbbbbbwebbbk',
    '...kbbbbbbbbbbbbbbbbbbbk',
    '..kbbbbbbbbbbbbbbbbbbbsk',
    '..kbbbbbbbbbbbbbbbbpbssk',
    '..kbbbbbbbbbbbbdbbbbbsnk',
    '..kdbbbbbbbbbbbbdbbbkkk.',
    '..kddbbbbbbbbbbbbbbbk...',
    '...kdddbbbbbbbbbbbddk...',
    '....kkddddddddddddkk....',
    '...kfk...kfk..kfk..kfk..',
    '...kk....kk...kk...kk...',
  ],
};

const PALETTE = { k: '#4a2c1e', b: '#c08a5a', l: '#d8a677', d: '#9c6a42', s: '#8a5c3b', n: '#3a2117', e: '#22140d', p: '#e3907e', f: '#5c3b28', w: '#ffffff' };

const SIZE = 72; // 24 px of art at 3x: easy to spot, still out of the way
const W = SIZE;
const H = SIZE * (16 / 24);
const SPEED = 20; // px per second, an amble
const SURFACES = '.panel, .sheet, .studio-head, .studio-pane, .notebook, .index-card, .tile, .font-tile, .filedrop, .nofluff-card, .mcq-option, .option';

type Mode = 'walk' | 'idle' | 'sleep' | 'startled' | 'held' | 'fall' | 'slide';

const GRAVITY = 1900; // px/s²
const MAX_THROW = 2600; // px/s
const BOUNCE_ABOVE = 480; // landing speed that makes him bounce
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = (pool: string[]) => pool[Math.floor(Math.random() * pool.length)] ?? '';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The space Capi lives in: right of the sidebar, above the phone tab bar. */
function world() {
  const narrow = window.innerWidth <= 860;
  return { left: narrow ? 0 : 244, right: window.innerWidth, ground: window.innerHeight - (narrow ? 66 : 0) - H };
}

export function Capi() {
  const { capi, noFluff } = useSettings();
  if (!capi || noFluff) return null;
  return <CapiPet />;
}

function CapiPet() {
  const elRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLSpanElement>(null);
  const s = useRef({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    squash: 0,
    hardThrow: false,
    samples: [] as { t: number; x: number; y: number }[],
    dir: 1 as 1 | -1,
    mode: 'sleep' as Mode,
    until: 0,
    surface: null as Element | null,
    grab: { dx: 0, dy: 0, startX: 0, startY: 0, moved: false, down: false },
  });
  const [mode, setModeState] = useState<Mode>('sleep');
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [bubble, setBubble] = useState<{ id: number; text: string } | null>(null);
  const bubbleTimer = useRef<number | undefined>(undefined);

  const say = (text: string, ms = 2600) => {
    window.clearTimeout(bubbleTimer.current);
    setBubble({ id: Date.now(), text });
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  };

  const setMode = (m: Mode, ms = 0) => {
    s.current.mode = m;
    s.current.until = performance.now() + ms;
    setModeState(m);
  };

  // Start asleep somewhere along the ground. He's very sleepy.
  useEffect(() => {
    const w = world();
    s.current.x = rand(w.left + 40, w.right - W - 40);
    s.current.y = w.ground;
    setMode('sleep', rand(15000, 40000));
  }, []);

  // The loop: walk, doze, follow the block he's standing on, fall when it goes away.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let stepAt = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = s.current;
      const w = world();

      // Where are his feet supposed to be?
      let floor = w.ground;
      let minX = w.left + 4;
      let maxX = w.right - W - 4;
      if (st.surface) {
        const r = st.surface.getBoundingClientRect();
        const gone = !st.surface.isConnected || r.width < W + 8 || r.top < -H || r.top > w.ground;
        if (gone) {
          st.surface = null;
          if (st.mode !== 'held') setMode('fall');
        } else {
          floor = r.top - H + 2;
          minX = r.left + 2;
          maxX = r.right - W - 2;
        }
      }

      if (st.mode === 'fall') {
        if (reducedMotion()) {
          st.y = floor;
          st.vx = st.vy = 0;
          setMode('idle', rand(1200, 2500));
        } else {
          // Airborne: gravity, a little air drag, spin, and bounces off the edges of the screen.
          const prevFeet = st.y + H;
          st.vy += GRAVITY * dt;
          st.vx *= Math.exp(-0.5 * dt);
          st.x += st.vx * dt;
          st.y += st.vy * dt;
          st.angle += st.vx * dt * 0.9;
          if (st.x < w.left + 2) {
            st.x = w.left + 2;
            st.vx = Math.abs(st.vx) * 0.55;
            st.squash = 0.6;
          } else if (st.x > w.right - W - 2) {
            st.x = w.right - W - 2;
            st.vx = -Math.abs(st.vx) * 0.55;
            st.squash = 0.6;
          }
          if (st.y < 0) {
            st.y = 0;
            st.vy = Math.abs(st.vy) * 0.4;
          }
          // Coming down: land on the first block top he crosses, or the ground.
          const feet = st.y + H;
          let landOn: Element | null = st.surface;
          let landAt = st.surface ? floor + H : w.ground + H;
          if (st.vy > 0) {
            const cx = st.x + W / 2;
            document.querySelectorAll(SURFACES).forEach((el) => {
              const r = el.getBoundingClientRect();
              if (r.width < W + 8 || cx < r.left + 6 || cx > r.right - 6 || r.top > w.ground) return;
              if (prevFeet <= r.top + 2 && feet >= r.top && r.top + 2 < landAt) {
                landOn = el;
                landAt = r.top + 2;
              }
            });
          }
          if (st.vy > 0 && feet >= landAt) {
            st.y = landAt - H;
            st.surface = landOn;
            st.squash = Math.min(1, st.vy / 1400);
            if (st.vy > BOUNCE_ABOVE) {
              st.vy = -st.vy * 0.4;
              st.vx *= 0.75;
            } else {
              st.vy = 0;
              st.angle = ((((st.angle + 180) % 360) + 360) % 360) - 180;
              if (Math.abs(st.vx) > 40) setMode('slide');
              else landed();
            }
          }
        }
      } else if (st.mode === 'slide') {
        // Skidding to a stop along whatever he landed on.
        st.y = floor;
        st.x += st.vx * dt;
        st.vx *= Math.exp(-6 * dt);
        if (st.x < minX || st.x > maxX) {
          st.x = clamp(st.x, minX, maxX);
          st.vx = -st.vx * 0.4;
        }
        if (Math.abs(st.vx) < 18) landed();
      } else if (st.mode !== 'held') {
        st.y = floor;
        if (st.mode === 'walk' && !reducedMotion()) {
          st.x += st.dir * SPEED * dt;
          if (st.x < minX || st.x > maxX) {
            st.dir = st.x < minX ? 1 : -1;
            setDir(st.dir);
          }
          if (now > stepAt) {
            setStep((n) => n + 1);
            stepAt = now + 240;
          }
        }
        st.x = Math.max(minX, Math.min(maxX, st.x));
        if (now > st.until) {
          // What next? Mostly naps.
          if (st.mode === 'walk') {
            if (Math.random() < 0.6) setMode('sleep', rand(20000, 50000));
            else setMode('idle', rand(2000, 5000));
          } else if (st.mode === 'idle' || st.mode === 'startled') {
            if (Math.random() < 0.7) {
              if (Math.random() < 0.5) {
                st.dir = st.dir === 1 ? -1 : 1;
                setDir(st.dir);
              }
              setMode('walk', rand(4000, 9000));
            } else setMode('sleep', rand(20000, 50000));
          } else if (st.mode === 'sleep') {
            setMode('walk', rand(3000, 7000));
          }
        }
      }

      if (st.mode !== 'fall' && st.mode !== 'held') st.angle *= Math.exp(-14 * dt);
      st.squash *= Math.exp(-9 * dt);

      const el = elRef.current;
      if (el) el.style.transform = `translate3d(${Math.round(st.x)}px, ${Math.round(st.y)}px, 0)`;
      const body = bodyRef.current;
      if (body) {
        const sq = st.squash;
        body.style.transform = `rotate(${st.angle.toFixed(1)}deg) scale(${(1 + 0.28 * sq).toFixed(3)}, ${(1 - 0.28 * sq).toFixed(3)})${st.dir < 0 ? ' scaleX(-1)' : ''}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  function landed() {
    const st = s.current;
    st.vx = 0;
    st.vy = 0;
    if (st.hardThrow) {
      st.hardThrow = false;
      setMode('startled', 2400);
      window.setTimeout(() => say(pick(CAPI_LANDED)), 150);
    } else {
      setMode('idle', rand(1500, 3000));
    }
  }

  function poke() {
    const st = s.current;
    if (st.mode === 'sleep') {
      setMode('startled', 2600);
      say('!!', 900);
      window.setTimeout(() => say(pick(CAPI_WOKEN)), 900);
    } else if (st.mode !== 'held' && st.mode !== 'fall' && st.mode !== 'slide') {
      setMode('startled', 1600);
      say(pick(CAPI_POKED));
    }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const st = s.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    st.grab = { dx: e.clientX - st.x, dy: e.clientY - st.y, startX: e.clientX, startY: e.clientY, moved: false, down: true };
    st.samples = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const st = s.current;
    if (!st.grab.down) return;
    if (!st.grab.moved && Math.hypot(e.clientX - st.grab.startX, e.clientY - st.grab.startY) < 5) return;
    if (!st.grab.moved) {
      st.grab.moved = true;
      st.surface = null;
      setMode('held');
      say('!!', 1200);
    }
    st.x = e.clientX - st.grab.dx;
    st.y = e.clientY - st.grab.dy;
    // Remember the last ~100ms of movement, to throw him with the hand's speed.
    const now = performance.now();
    st.samples.push({ t: now, x: e.clientX, y: e.clientY });
    while (st.samples.length > 2 && now - st.samples[0].t > 100) st.samples.shift();
    // Swing as he's carried.
    const first = st.samples[0];
    const vxNow = (e.clientX - first.x) / Math.max(16, now - first.t);
    st.angle += (clamp(-vxNow * 18, -38, 38) - st.angle) * 0.25;
  }

  function onPointerUp() {
    const st = s.current;
    if (!st.grab.down) return;
    st.grab.down = false;
    if (!st.grab.moved) {
      poke();
      return;
    }
    // Let go: throw him with the speed of the last bit of the drag.
    const now = performance.now();
    const first = st.samples[0];
    const last = st.samples[st.samples.length - 1];
    const span = Math.max(16, last.t - first.t);
    const recent = now - last.t < 80;
    st.vx = recent ? clamp(((last.x - first.x) / span) * 1000, -MAX_THROW, MAX_THROW) : 0;
    st.vy = recent ? clamp(((last.y - first.y) / span) * 1000, -MAX_THROW, MAX_THROW) : 0;
    st.surface = null;
    st.hardThrow = Math.hypot(st.vx, st.vy) > 1100;
    setMode('fall');
    if (st.hardThrow) say(pick(CAPI_THROWN), 1400);
    else if (Math.random() < 0.6) window.setTimeout(() => say(pick(CAPI_DROPPED)), 350);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      poke();
    }
  }

  const frame =
    mode === 'sleep'
      ? BODY.sleep
      : mode === 'startled' || mode === 'fall' || mode === 'slide'
        ? BODY.startled
        : mode === 'held'
          ? BODY.walk2
          : step % 2
            ? BODY.walk2
            : BODY.walk1;

  return (
    <div
      ref={elRef}
      className={`capi is-${mode}`}
      role="button"
      tabIndex={0}
      aria-label={mode === 'sleep' ? 'Capi the capybara, asleep. Press to wake him.' : 'Capi the capybara. Press to say hi, or drag him somewhere.'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (s.current.grab.down = false)}
      onKeyDown={onKeyDown}
    >
      <span className="capi-body" ref={bodyRef} data-dir={dir}>
        <PixelSprite rows={frame} palette={PALETTE} size={SIZE} />
      </span>
      {mode === 'sleep' && (
        <span className="capi-z" aria-hidden="true">
          <span>z</span>
          <span>z</span>
          <span>Z</span>
        </span>
      )}
      {bubble && (
        <span key={bubble.id} className="capi-bubble" aria-live="polite">
          {bubble.text}
        </span>
      )}
    </div>
  );
}
