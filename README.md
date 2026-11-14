# Capi’s Deck

A study app: make decks of flashcards, review them on a schedule, quiz yourself, and see your streak and progress. Everything is saved in the browser's `localStorage`; there is no backend.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
```

## What's in it

- **Look**: a cream sidebar beside a pixel-art wallpaper, with content on translucent panels. Wallpapers are original pixel art drawn by `scripts/make_wallpapers.py` (run `python scripts/make_wallpapers.py public/wallpapers` to regenerate).
- **Customizations** (`/customize`): No fluff mode (no wallpaper, Capi, pop-ups, EXP, keys or sounds; plain fonts; free hints; first-try accuracy while studying), wallpaper (eight warm pixel scenes, plain, or your own image stored in IndexedDB), light / dark / midnight / match device, four font sets, and toggles for doodles, the ding and Capi.
- **Capi** (`src/components/Capi.tsx`): a tiny, very sleepy pixel capybara who wanders the bottom of the page. Click to wake him (he's startled), drag him onto any block and he walks along its top. His lines are in `src/content/messages.ts`. Settings apply before first paint (see `index.html` and `src/lib/settings.ts`).
- **Home**: start a deck, drop a file, the deck table with New / Learn / Due counts, a pixel tomato that opens the focus timer, and the activity grid with a streak bubble.
- **Card repository** (`/decks`): every deck with its counts. **Friends** is a placeholder until there are accounts and sync.
- **Card studio** (`/studio`): drop a file, confirm it, and it opens beside the card maker. Select text in the document and send it to the front, back or a cloze with the floating toolbar (or `F`, `B`, `C`; `H` just highlights). Used text stays highlighted. "Cards on the left/right" swaps the panes; on phones the panes become Document / Card tabs.
- **Card types** (per card): Basic, Basic and reversed, Cloze (`{{c1::…}}`, each deletion reviewed on its own), and Image occlusion (draw boxes on an image; hide one or hide all, guess one).
- **Formatting** (per card): bold, italic, underline, highlight, and LaTeX math via KaTeX (`$x^2$`, `$$…$$`), with toolbar buttons, shortcuts (Ctrl+B/I/U, Ctrl+Shift+H, Ctrl+M, Ctrl+Shift+C) and a live preview.
- **Study**: an index card that flips (Space), then `1` Again / `2` Knew it. Every direction, cloze and mask has its own schedule (Leitner ladder in `src/lib/srs.ts`).
- **Quiz**: multiple choice from the deck's answers; cloze cards are asked as fill-in-the-blank, image cards are skipped. Unlimited hearts and hints.
- **Focus timer**: the timer icon in the top bar. Running timers float at the top, blink red in the last minute, and glide to the middle with a "take a rest" message (sometimes in Japanese) when they finish.
- **Progress**: mastery, accuracy over time, per-deck stats.

Files are read in the browser (`src/lib/extract.ts`) and never uploaded. Card data is in `localStorage`; images for occlusion cards are in IndexedDB (`src/lib/images.ts`).

## Limits worth knowing

- Browsers cap `localStorage` (usually around 5 MB). If it fills up, the app says so and keeps changes in memory until you free space.
- Data lives in one browser on one device; there's no sync or export yet.
- Scanned PDFs without a text layer can't be read; images open in the studio for occlusion cards but their text isn't read.
