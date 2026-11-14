import { useSyncExternalStore } from 'react';
import { getImage, putImage } from './images';

/** Look-and-feel choices from the Customizations page. Applied as data attributes on <html>. */

export type ThemePref = 'light' | 'dark' | 'midnight' | 'system';
export type FontPref = 'storybook' | 'pixel' | 'arcade' | 'soft';
export type WallpaperPref = 'cottage' | 'sakura' | 'night' | 'seaside' | 'ivy' | 'autumn' | 'lane' | 'scroll' | 'none' | 'custom';

export interface Settings {
  theme: ThemePref;
  font: FontPref;
  wallpaper: WallpaperPref;
  /** Keep a custom wallpaper's pixels sharp when it's scaled up (good for pixel art). */
  sharpCustom: boolean;
  /** How see-through the page panels are: 0 is glass, 50 the theme's default, 100 solid. */
  panelOpacity: number;
  doodles: boolean;
  /** A short ding on every correct answer. */
  ding: boolean;
  /** Capi the capybara wandering along the bottom of the page. */
  capi: boolean;
  /**
   * No fluff mode: no wallpaper, Capi, pop-ups, EXP, keys, doodles or sounds, and plain fonts.
   * Overrides the individual choices without changing them, so turning it off restores everything.
   */
  noFluff: boolean;
}

export const SETTINGS_KEY = 'margin:settings';
const CUSTOM_WALLPAPER_ID = 'wallpaper:custom';

export const DEFAULT_SETTINGS: Settings = { theme: 'light', font: 'storybook', wallpaper: 'cottage', sharpCustom: true, panelOpacity: 50, doodles: true, ding: true, capi: true, noFluff: false };

export const WALLPAPERS: { id: Exclude<WallpaperPref, 'none' | 'custom'>; label: string; note: string }[] = [
  { id: 'cottage', label: 'Cottage meadow', note: 'A red roof and a path through warm afternoon grass' },
  { id: 'ivy', label: 'Ivy cottage', note: 'Timber beams, a chimney and a flower garden' },
  { id: 'autumn', label: 'Autumn village', note: 'Hillside houses among orange trees, over a lake' },
  { id: 'lane', label: 'Village lane', note: 'Wooden houses, a cherry tree and power lines' },
  { id: 'scroll', label: 'Handscroll', note: 'A pagoda, pines and blossom painted on parchment' },
  { id: 'sakura', label: 'Sakura shrine', note: 'A torii gate and cherry trees at dusk' },
  { id: 'night', label: 'Night town', note: 'Lamplit windows, power lines and a vending machine' },
  { id: 'seaside', label: 'Seaside sunset', note: 'A lighthouse and a soft apricot sea' },
];

export const FONTS: { id: FontPref; label: string; note: string }[] = [
  { id: 'storybook', label: 'Storybook', note: 'Serif headings, clean sans text' },
  { id: 'pixel', label: 'Pixel', note: 'DotGothic16 everywhere, like an old handheld' },
  { id: 'arcade', label: 'Arcade', note: 'Pixel headings, easy-reading text' },
  { id: 'soft', label: 'Soft round', note: 'Rounded Zen Maru Gothic throughout' },
];

function load(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    // Carry over the theme chosen before customizations existed.
    const oldTheme = localStorage.getItem('margin:theme');
    if (oldTheme === 'light' || oldTheme === 'dark') return { ...DEFAULT_SETTINGS, theme: oldTheme };
  } catch {
    // fall through
  }
  return DEFAULT_SETTINGS;
}

let settings = load();
const listeners = new Set<() => void>();
let customUrl: string | null = null;

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

function apply(s: Settings) {
  const root = document.documentElement;
  root.dataset.theme = s.theme === 'system' ? (systemDark() ? 'dark' : 'light') : s.theme;
  root.dataset.font = s.noFluff ? 'plain' : s.font;
  root.dataset.wallpaper = s.noFluff ? 'none' : s.wallpaper;
  root.dataset.doodles = s.doodles && !s.noFluff ? 'on' : 'off';
  root.dataset.fluff = s.noFluff ? 'off' : 'on';
  root.style.setProperty('--panel-t', String((s.panelOpacity - 50) / 50));
  if (s.noFluff) {
    root.style.setProperty('--wallpaper', 'none');
    return;
  }
  root.dataset.sharp = s.wallpaper !== 'custom' || s.sharpCustom ? 'on' : 'off';
  if (s.wallpaper === 'custom') {
    if (customUrl) root.style.setProperty('--wallpaper', `url("${customUrl}")`);
    else
      getImage(CUSTOM_WALLPAPER_ID).then((blob) => {
        if (!blob) return update({ wallpaper: 'cottage' });
        customUrl = URL.createObjectURL(blob);
        if (settings.wallpaper === 'custom') root.style.setProperty('--wallpaper', `url("${customUrl}")`);
      });
  } else if (s.wallpaper === 'none') {
    root.style.setProperty('--wallpaper', 'none');
  } else {
    root.style.setProperty('--wallpaper', `url("/wallpapers/${s.wallpaper}.png")`);
  }
}

apply(settings);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => settings.theme === 'system' && apply(settings));

export function update(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Applies for this visit only.
  }
  apply(settings);
  listeners.forEach((l) => l());
}

export async function setCustomWallpaper(file: File) {
  await putImage(CUSTOM_WALLPAPER_ID, file);
  if (customUrl) URL.revokeObjectURL(customUrl);
  customUrl = URL.createObjectURL(file);
  update({ wallpaper: 'custom' });
}

export const hasCustomWallpaper = () => getImage(CUSTOM_WALLPAPER_ID).then(Boolean);
export const customWallpaperUrl = () => customUrl;

export const getSettings = () => settings;

/** True when playful extras (pop-ups, EXP, keys, sounds, Capi) should show. */
export const fluffOn = () => !settings.noFluff;

export const useSettings = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => settings,
  );
