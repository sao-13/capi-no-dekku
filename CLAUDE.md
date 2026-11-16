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
- `src/components/` UI pieces, each with a sibling `.css`. Notables are Layout (sidebar, mobile tab bar, mounts Capi/Pomodoro host/popups), FocusLayout (study and quiz: no sidebar, top bar or tab bar, just the wallpaper, `StorageNotice` and the same hosts; `main.stage.is-solo`, and `:root:has(.stage.is-solo)` zeroes `--sidebar-w`), SessionBar, StickyNotes, Capi, CardEditor, Pomodoro, DocViewer, Heatmap. Both layouts use `lib/useRouteFocus.ts` (scroll to top and focus `<main>` on navigation, not on first load)
- `src/lib/` logic and stores, no JSX
- `src/content/messages.ts` user-editable pop-up and Capi speech lines
- `src/styles/` tokens.css (palettes, fonts, layout tokens), base.css, ui.css, nofluff.css
- `public/wallpapers/` 8 generated pixel scenes; `index.html` has an inline script that applies theme, font and wallpaper before first paint

## Features and where the logic lives
- Data model: `lib/types.ts`. Persistence: `lib/store.ts` (decks, cards, reviews, localStorage `margin:data:v1`, save errors shown by StorageNotice)
- Spaced repetition: `lib/srs.ts`. Leitner boxes with intervals `[0,1,3,7,16,35,80]` days; mastered at box 4 or higher. Scheduling is per item: reversed gives `fwd`/`rev`, cloze gives `c1..cN`, occlusion gives one per mask. The first variant uses `card.srs`, the rest use `card.variantSrs[variant]`.
- Card types: basic, reversed, cloze, image occlusion, `mcq` (shown as "Gizmo Style": 1 right and 3 wrong answers), `typein` (shown as "Type-in": Question and Answer, the learner types the answer). Editor in `CardEditor.tsx`, `OcclusionEditor/View.tsx`; rendering in `CardContent.tsx`.
- Type-in grading: `lib/typein.ts` (pure logic). Ignores case, punctuation, spacing and markup, matches words in order (LCS), and forgives 1 typo in words of 5+ letters and 2 in words of 9+.
- Card markup (`lib/markup.ts`, `RichText.tsx`, `FormatField.tsx`): `**b**`, `*i*`, `__u__`, `==highlight==`, `$math$`, `$$display$$`, `{{c1::cloze::hint}}`. Use `\$` for a literal dollar.
- Quiz: `lib/quiz.ts` and `pages/Quiz.tsx`. It skips occlusion cards, turns cloze into fill-in-the-blank, mcq uses its own wrong answers, and Type-in cards appear as ordinary multiple choice.
- Study and quiz screen: both routes sit under FocusLayout. `SessionBar` is the top bar (X to leave, deck name, "Sticky notes" button with a dot when the card has a note), the progress bar and a stats pill (unlimited hearts, "+N EXP" earned this session from `useSessionCheers().earned`, cards or questions left). The card, choices, answer box, buttons and loose text lines are solid paper (`--bg`) floating on the wallpaper; the card is flat (no ruled lines). Non-session states (missing deck, caught up, done, quiz setup and results) sit on a centred `.sheet`.
- Study: `pages/Study.tsx`. Hints with H are free and unlimited (two hint levels, or rule out a wrong Gizmo Style choice). Self-graded cards (basic, reversed, cloze, occlusion) are rated after the flip: 1/Space/Enter "Understood well" (grade 1, moves up a box), 2 "Almost" (grade 2, keeps the box, back in 5 minutes but never makes the learner wait), 3 "Didn't understand" (grade 3, box 0, back after 3 cards). Key repeats are ignored. Gizmo Style picks by keys 1-4. Type-in shows a text box (Enter checks, auto-graded, then Enter/Space/1 for the next card). Wrong auto-graded answers also come back after 3 cards. `schedule()` and `answerStudy()` take the grade, and study reviews store `grade`. The card flip is 450ms, the one deliberate exception to the 150-200ms motion rule, and plays `whoosh()` from `lib/sound.ts`.
- Gamification: `lib/xp.ts` (EXP derived from history, never stored), `lib/useSessionCheers.ts` (dings, pop-ups, EXP floats), `lib/popup.ts` and `PopupHost`, `lib/sound.ts`
- Streaks and stats: `lib/stats.ts`, `deckStats.ts`, `dates.ts`; `Heatmap`, `MonthCalendar`, `AccuracyChart`, `StreakChip`
- Deck table (`components/DeckTable.tsx`, on Home as "Review your decks" and on Card repository with Cards and Last studied): columns "New cards" and "Studied cards" count cards, not review items (`isNewCard` in `srs.ts`: every item has reps 0). Rows are banded, each has a "Review" button to `/decks/:id/study`, and the deck name still goes to study when anything is new or due, else to the deck page. Headings shorten to "New" / "Studied" (and cells tighten) when the table is 500px wide or less, a container query on `.deck-table-wrap`. Home has no "Review all" link; `/study` exists by address only.
- Card categories are labels only: `cardCategory(card, latestGrades(reviews))` in `srs.ts` gives New, Easy, Can recall or Weak memory (`CATEGORY_LABEL`) from the latest study grade per item (older reviews without a grade use correct = Easy, wrong = Weak memory), weakest item wins, and New wins whenever every item has reps 0. Scheduling underneath is unchanged and still picks cards by due date.
- Deck page (`pages/DeckDetail.tsx`): summary "N cards. x new, y studied.", a "Review" button, card search plus Category and Card type filters (shown with more than 6 cards, combined with AND), a category tag per card, and "Reset to new" per studied card (toast with Undo) or "Reset studied cards" for the deck (confirm dialog). `resetCards(ids)` in `store.ts` sets `srs` to `newSrs(today)` and drops `variantSrs`; reviews stay, so streak, EXP and activity don't change. `restoreSchedules` undoes it.
- Card studio: `pages/Studio.tsx` and `DocViewer.tsx` (PDF, Word, image and text viewers with zoom; highlight text and send it to a card). Dropped files are held in `lib/pendingFiles.ts`, and `FileDrop.tsx` asks before opening. Split is resizable and the cards side swappable (stored in localStorage).
- Pomodoro: `lib/pomodoro.ts` and `components/Pomodoro.tsx` (portal `TimerHost`)
- Capi pet: `components/Capi.tsx` and `Capi.css`. It is a rAF physics loop with modes `walk|idle|sleep|startled|held|fall|slide`. He is draggable and throwable, lands on `SURFACES` selectors, and the sprites are 24x16 drawn by `PixelSprite` in `Doodles.tsx`.
- Sticky notes: `components/StickyNotes.tsx` and `lib/notes.ts`. A 90s-style note window (title bar in `--note-bar`/`--note-bar-ink`, ruled paper) with two notes: "This card" (one per card id, so a reversed card's two sides share it) and "Deck note" (the old notebook text). It peels open from the top corner in 200ms (off with reduced motion or No fluff). It sits right of the 720px column at 1400px and wider, below the controls otherwise. The old Notebook and the hint keys (`lib/keys.ts`) are gone; the old `margin:keys` value is left in storage, unused.
- Settings and theming: `lib/settings.ts`, `pages/Customize.tsx`. Themes are light, dark, midnight and system. Fonts are storybook, arcade, soft and plain (a saved 'pixel' choice from before falls back to arcade). There are 8 wallpapers plus none or custom (custom image in IndexedDB via `lib/images.ts`). The panel see-through slider (`settings.panelOpacity`, 0 glass, 50 default, 100 solid) sets `--panel-t`, and `tokens.css` derives `--panel`, `--panel-blur` and `--panel-muted` from it.
- No fluff mode: `settings.noFluff` hides wallpapers, Capi, pop-ups, EXP, doodles and the ding, and switches to the plain font. `styles/nofluff.css` plus `fluffOn()` guards. It overrides settings without destroying them.

## Storage keys
localStorage: `margin:data:v1`, `margin:settings`, `margin:notes` (card notes, `{ [cardId]: text }`), `margin:pomodoro`, `margin:pomodoro:last`, `margin:notebook:open` (sticky notes open), `margin:notebook:<deckId|all>` (deck notes), `margin:studio:cards-side`, `margin:studio:split`. `margin:keys` is a leftover from the removed hint keys. IndexedDB `margin-images` holds occlusion images and `wallpaper:custom`.

## Conventions
- Colours, fonts and spacing come only from CSS variables in `tokens.css`. All text must keep at least 4.5:1 contrast in every theme, so check new colours. `--note-bar` and `--note-bar-ink` (sticky note title bar) are defined per theme.
- 8px spacing grid, motion 150-200ms (except the 450ms study card flip), and every animation needs a `prefers-reduced-motion` fallback. No purple or blue gradients, no glassmorphism (the user-chosen panel slider is the one exception), no emoji icons (use lucide or pixel sprites).
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
