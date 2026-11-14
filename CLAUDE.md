# Capi's Deck (カピのデッキ)

Flashcard study web app, Gizmo-inspired but original. Japanese cutesy retro-pixel look, a capybara pet (Capi) that roams the page, and spaced repetition. No backend: all data lives in the browser. (Package name is still `margin`, and storage keys are prefixed `margin:`. Don't rename them, since that would wipe users' data.)

## Stack
Vite 8, React 19, TypeScript 7, react-router-dom 7, plain CSS with variables (no Tailwind, no UI kit), lucide-react icons. KaTeX (math), pdfjs-dist (PDF viewer), docx-preview (Word viewer), fflate (zip), fontsource fonts. State uses `useSyncExternalStore` stores in `src/lib`, not Redux or context.

## Run
- `npm run dev` serves http://localhost:5173 (strict port, so stop any old server first)
- `npm run build` runs `tsc --noEmit` then `vite build`. Run it before calling work done.
- `npm run typecheck`, `npm run preview` (port 4173)
- Wallpapers: `python -I scripts/make_wallpapers.py public/wallpapers [scene...]` (pure stdlib, regenerates the 384x216 PNGs)
- Share image: `chrome.exe --headless=new --hide-scrollbars --allow-file-access-from-files --window-size=1200,630 --virtual-time-budget=4000 --screenshot=C:/rea_repo_works/public/og.png file:///C:/rea_repo_works/scripts/og-image.html` (pixel scene drawn on a canvas; the favicon `public/favicon.svg` is a 24x24 Capi sitting under a lightbulb)
- Not a git repo. Windows 11, PowerShell or Git Bash.

## Layout
- `src/pages/` one route each: Today (home), Decks (card repository), DeckDetail, Study, Quiz, Studio (file viewer + card maker), Progress, Friends (placeholder), Customize, NotFound
- `src/components/` UI pieces, each with a sibling `.css`. Notables are Layout (sidebar, mobile tab bar, mounts Capi/Pomodoro host/popups), Capi, CardEditor, Pomodoro, DocViewer, Notebook, Heatmap
- `src/lib/` logic and stores, no JSX
- `src/content/messages.ts` user-editable pop-up and Capi speech lines
- `src/styles/` tokens.css (palettes, fonts, layout tokens), base.css, ui.css, nofluff.css
- `public/wallpapers/` 8 generated pixel scenes; `index.html` has an inline script that applies theme, font and wallpaper before first paint

## Features and where the logic lives
- Data model: `lib/types.ts`. Persistence: `lib/store.ts` (decks, cards, reviews, localStorage `margin:data:v1`, save errors shown by StorageNotice)
- Spaced repetition: `lib/srs.ts`. Leitner boxes with intervals `[0,1,3,7,16,35,80]` days; mastered at box 4 or higher. Scheduling is per item: reversed gives `fwd`/`rev`, cloze gives `c1..cN`, occlusion gives one per mask. The first variant uses `card.srs`, the rest use `card.variantSrs[variant]`.
- Card types: basic, reversed, cloze, image occlusion, `mcq` (shown as "Gizmo Style": 1 right and 3 wrong answers). Editor in `CardEditor.tsx`, `OcclusionEditor/View.tsx`; rendering in `CardContent.tsx`.
- Card markup (`lib/markup.ts`, `RichText.tsx`, `FormatField.tsx`): `**b**`, `*i*`, `__u__`, `==highlight==`, `$math$`, `$$display$$`, `{{c1::cloze::hint}}`. Use `\$` for a literal dollar.
- Quiz: `lib/quiz.ts` and `pages/Quiz.tsx`. It skips occlusion cards, turns cloze into fill-in-the-blank, and mcq uses its own wrong answers.
- Study: `pages/Study.tsx`. Hints with H cost a key, answers by keys 1-4, and the Notebook column is optional.
- Gamification: `lib/xp.ts` (EXP derived from history, never stored), `lib/keys.ts` (10 hint keys; `window.addKeys(n)` tops up), `lib/useSessionCheers.ts` (dings, pop-ups, EXP floats), `lib/popup.ts` and `PopupHost`, `lib/sound.ts`
- Streaks and stats: `lib/stats.ts`, `deckStats.ts`, `dates.ts`; `Heatmap`, `MonthCalendar`, `AccuracyChart`, `StreakChip`
- Card studio: `pages/Studio.tsx` and `DocViewer.tsx` (PDF, Word, image and text viewers with zoom; highlight text and send it to a card). Dropped files are held in `lib/pendingFiles.ts`, and `FileDrop.tsx` asks before opening. Split is resizable and the cards side swappable (stored in localStorage).
- Pomodoro: `lib/pomodoro.ts` and `components/Pomodoro.tsx` (portal `TimerHost`)
- Capi pet: `components/Capi.tsx` and `Capi.css`. It is a rAF physics loop with modes `walk|idle|sleep|startled|held|fall|slide`. He is draggable and throwable, lands on `SURFACES` selectors, and the sprites are 24x16 drawn by `PixelSprite` in `Doodles.tsx`.
- Settings and theming: `lib/settings.ts`, `pages/Customize.tsx`. Themes are light, dark, midnight and system. Fonts are storybook, pixel, arcade, soft and plain. There are 8 wallpapers plus none or custom (custom image in IndexedDB via `lib/images.ts`). The panel see-through slider (`settings.panelOpacity`, 0 glass, 50 default, 100 solid) sets `--panel-t`, and `tokens.css` derives `--panel`, `--panel-blur` and `--panel-muted` from it.
- No fluff mode: `settings.noFluff` hides wallpapers, Capi, pop-ups, EXP, doodles and the ding, and switches to the plain font. `styles/nofluff.css` plus `fluffOn()` guards. It overrides settings without destroying them.

## Storage keys
localStorage: `margin:data:v1`, `margin:settings`, `margin:keys`, `margin:pomodoro`, `margin:pomodoro:last`, `margin:notebook:open`, `margin:notebook:<deckId|all>`, `margin:studio:cards-side`, `margin:studio:split`. IndexedDB `margin-images` holds occlusion images and `wallpaper:custom`.

## Conventions
- Colours, fonts and spacing come only from CSS variables in `tokens.css`. All text must keep at least 4.5:1 contrast in every theme, so check new colours.
- 8px spacing grid, motion 150-200ms, and every animation needs a `prefers-reduced-motion` fallback. No purple or blue gradients, no glassmorphism (the user-chosen panel slider is the one exception), no emoji icons (use lucide or pixel sprites).
- Any new fluff (animations, sounds, pop-ups, decorations) must be hidden in No fluff mode, so add it to `nofluff.css` or guard it with `fluffOn()`.
- Accessible by default: real buttons, labels, focus rings, keyboard paths (Capi included).
- Keep wording in `content/messages.ts` verbatim; the user has hand-edited it. The Friends page copy is fixed too.
- Desktop first with a mobile fallback: the sidebar becomes a topbar plus a 5-tab bar at 860px or less.
- Only add comments for non-obvious reasons. No new abstractions beyond the task.
- Make new store changes through `lib/store.ts` or `lib/settings.ts`, never write localStorage directly from components.

## Testing UI
Drive headless Chrome on port 9223 over CDP (the visible window stalls on mouse input). Check each change in the browser and look for console errors, not just `tsc`.

## Not built yet
Accounts, friends and leaderboard (plan: Supabase Auth + Postgres with Row Level Security, with guest mode kept and EXP computed server-side). Also export/backup, Anki import, and Capi's room (clicker, squishies).
