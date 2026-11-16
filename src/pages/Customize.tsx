import { useEffect, useState } from 'react';
import { Check, ImagePlus, Monitor, Moon, MoonStar, Sun } from 'lucide-react';
import { customWallpaperUrl, FONTS, hasCustomWallpaper, setCustomWallpaper, update, useSettings, WALLPAPERS, type ThemePref } from '../lib/settings';
import { showToast } from '../lib/toast';
import './Customize.css';

const THEMES: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'midnight', label: 'Midnight', icon: MoonStar },
  { id: 'system', label: 'Match my device', icon: Monitor },
];

function opacityText(v: number) {
  if (v === 50) return 'Default';
  if (v === 0) return 'Glass';
  if (v === 100) return 'Solid';
  return v < 50 ? `More see-through, ${v} of 100` : `More solid, ${v} of 100`;
}

export function Customize() {
  const s = useSettings();
  const [hasCustom, setHasCustom] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    hasCustomWallpaper().then(setHasCustom);
  }, []);

  async function pickWallpaper(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('That file isn’t an image. Use a PNG, JPEG, WebP or GIF.', { tone: 'error' });
      return;
    }
    setUploading(true);
    try {
      await setCustomWallpaper(file);
      setHasCustom(true);
      showToast('Wallpaper set.');
    } catch {
      showToast('That image couldn’t be saved in this browser. Check that storage isn’t full or blocked.', { tone: 'error' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="page customize">
      <header className="page-head">
        <h1>Customizations</h1>
        <p className="page-lede">Make the desk yours. Changes apply straight away and are saved in this browser.</p>
      </header>

      <section className={`nofluff-card${s.noFluff ? ' is-on' : ''}`} aria-labelledby="nofluff-heading">
        <div>
          <h2 id="nofluff-heading">No fluff mode</h2>
          <p className="muted">
            For serious studying: no wallpaper, no Capi, no pop-ups, EXP or sounds, plain fonts and plain cards.
            Hints become free, and study shows your first-try accuracy as you go. Your other choices are kept for when
            you turn it off.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={s.noFluff}
          aria-labelledby="nofluff-heading"
          className="switch"
          onClick={() => update({ noFluff: !s.noFluff })}
        >
          <span className="switch-knob" aria-hidden="true" />
          <span className="switch-text">{s.noFluff ? 'On' : 'Off'}</span>
        </button>
      </section>

      {s.noFluff && <p className="notice">No fluff mode is on, so the wallpaper, font and extras below are paused. Theme still applies.</p>}

      <section className="section" aria-labelledby="wall-heading">
        <div className="section-head">
          <h2 id="wall-heading">Wallpaper</h2>
        </div>
        <div className="tile-grid" role="group" aria-label="Wallpaper">
          {WALLPAPERS.map((w) => (
            <button key={w.id} type="button" className="tile" aria-pressed={s.wallpaper === w.id} onClick={() => update({ wallpaper: w.id })}>
              <span className="tile-thumb is-pixel" style={{ backgroundImage: `url(/wallpapers/${w.id}.png)` }} aria-hidden="true" />
              <span className="tile-label">
                {w.label}
                {s.wallpaper === w.id && <Check size={14} aria-hidden="true" />}
              </span>
              <span className="tile-note">{w.note}</span>
            </button>
          ))}
          <button type="button" className="tile" aria-pressed={s.wallpaper === 'none'} onClick={() => update({ wallpaper: 'none' })}>
            <span className="tile-thumb is-plain" aria-hidden="true" />
            <span className="tile-label">
              Plain
              {s.wallpaper === 'none' && <Check size={14} aria-hidden="true" />}
            </span>
            <span className="tile-note">Just the paper colour</span>
          </button>
          <div className={`tile tile-upload${s.wallpaper === 'custom' ? ' is-on' : ''}`}>
            {hasCustom ? (
              <button type="button" className="tile-thumb-btn" aria-pressed={s.wallpaper === 'custom'} onClick={() => update({ wallpaper: 'custom' })} aria-label="Use your own wallpaper">
                <span
                  className={`tile-thumb${s.sharpCustom ? ' is-pixel' : ''}`}
                  style={{ backgroundImage: customWallpaperUrl() ? `url(${customWallpaperUrl()})` : undefined }}
                  aria-hidden="true"
                />
              </button>
            ) : (
              <span className="tile-thumb is-empty" aria-hidden="true">
                <ImagePlus size={22} />
              </span>
            )}
            <span className="tile-label">
              Your own image
              {s.wallpaper === 'custom' && <Check size={14} aria-hidden="true" />}
            </span>
            <label className="btn btn-sm">
              <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => pickWallpaper(e.target.files?.[0])} />
              {uploading ? 'Saving…' : hasCustom ? 'Choose another' : 'Choose an image'}
            </label>
          </div>
        </div>
        {s.wallpaper === 'custom' && (
          <label className="check">
            <input type="checkbox" checked={s.sharpCustom} onChange={(e) => update({ sharpCustom: e.target.checked })} />
            Keep pixels sharp when the image is scaled up (best for pixel art; turn off for photos)
          </label>
        )}
        <div className="opacity-field">
          <label htmlFor="panel-opacity" className="opacity-label">
            Panel see-through
          </label>
          <div className="opacity-row">
            <span className="opacity-end" aria-hidden="true">
              Glass
            </span>
            <input
              id="panel-opacity"
              type="range"
              min={0}
              max={100}
              step={5}
              value={s.panelOpacity}
              aria-valuetext={opacityText(s.panelOpacity)}
              disabled={s.noFluff}
              onChange={(e) => update({ panelOpacity: Number(e.target.value) })}
            />
            <span className="opacity-end" aria-hidden="true">
              Solid
            </span>
            <button type="button" className="btn btn-sm" disabled={s.panelOpacity === 50 || s.noFluff} onClick={() => update({ panelOpacity: 50 })}>
              Reset
            </button>
          </div>
          <p className="field-hint">Slide toward glass to let more of the wallpaper show through the pages. Solid is easiest to read.</p>
        </div>
      </section>

      <section className="section" aria-labelledby="theme-heading">
        <div className="section-head">
          <h2 id="theme-heading">Theme</h2>
        </div>
        <div className="choice-row" role="group" aria-label="Theme">
          {THEMES.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className="theme-choice" aria-pressed={s.theme === id} onClick={() => update({ theme: id })}>
              <span className={`theme-swatch is-${id}`} aria-hidden="true" />
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <p className="field-hint">Dark dims the wallpaper a little so text stays easy to read. Midnight goes darker still, for late nights.</p>
      </section>

      <section className="section" aria-labelledby="font-heading">
        <div className="section-head">
          <h2 id="font-heading">Fonts</h2>
        </div>
        <div className="font-grid" role="group" aria-label="Fonts">
          {FONTS.map((f) => (
            <button key={f.id} type="button" className={`font-tile font-${f.id}`} aria-pressed={s.font === f.id} onClick={() => update({ font: f.id })}>
              <span className="font-sample-head">Capi’s Deck</span>
              <span className="font-sample-body">Review 12 cards before lunch. 今日も頑張ろう</span>
              <span className="tile-label">
                {f.label}
                {s.font === f.id && <Check size={14} aria-hidden="true" />}
              </span>
              <span className="tile-note">{f.note}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="extras-heading">
        <div className="section-head">
          <h2 id="extras-heading">Extras</h2>
        </div>
        <label className="check">
          <input type="checkbox" checked={s.doodles} onChange={(e) => update({ doodles: e.target.checked })} />
          Show doodles on the home page (the tomato timer and the streak bubble)
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={s.ding}
            onChange={(e) => {
              update({ ding: e.target.checked });
              if (e.target.checked) import('../lib/sound').then((m) => m.ding());
            }}
          />
          Play a little “ding” for every correct answer
        </label>
        <label className="check">
          <input type="checkbox" checked={s.capi} onChange={(e) => update({ capi: e.target.checked })} />
          Let Capi the capybara wander along the bottom of the page
        </label>
      </section>
    </div>
  );
}
