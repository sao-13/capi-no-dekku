/**
 * ✏️  EDIT YOUR POP-UP MESSAGES HERE.
 *
 * Every list below is a pool. Each time the page loads (or reloads), one line is picked at
 * random from each pool and used until the next reload. Add, remove or reword lines freely:
 * keep each one inside quotes and end it with a comma. A pool needs at least one line.
 */

/** (1) The note under the pomodoro tomato on the home page. */
export const TOMATO_NOTES = [
  'use the pomodoro timer! >w<',
  'click me for a study timer ^^',
];

/** (2) Pops up after every ten cards or questions answered in a session. */
export const EVERY_TEN = [
  'ten down! ur doing great ✿',
  'inshallah we got einstein here',
  'ten more in the brain bank!',
  'lfg! 10 cards done',
];

/** (3) Pops up when the progress bar reaches the halfway point of a session. */
export const PROGRESS_HALFWAY = [
  'halfway there!!',
  'the bar is half full babyyy',
  'past the middle, almost done!',
];

/** (4) Pops up after three wrong answers in a row. */
export const THREE_WRONG = [
  'god damn! youre retarded!',
  'it’s okay! mistakes = learning',
  'slow down a little, u got this',
  'm-m-mothafucking forest gump!',
];

/** Pops up after five wrong answers in a row. */
export const FIVE_WRONG = ["pastor nestor's eyeing you wallahi"];

/** (5) Pops up after ten right answers in a row. */
export const TEN_RIGHT = [
  '10 in a row!! ur on fire!!',
  'perfect streak of 10 ✧',
  'unstoppable~ 10 correct!',
];

/** (6) Shown when a deck session or quiz is finished. */
export const DECK_FINISHED = [
  'all finished! treat yourself ^^',
  'yay! that’s the whole deck ✿',
];

/** Shown when a hint is asked for with no keys left. */
export const OUT_OF_KEYS = ['oops! ask enzo for more keys.'];

/** Shown when the level goes up. "{level}" is replaced with the new level. */
export const LEVEL_UP = ['level up! now Lv {level} ✧', 'Lv {level}!! sugoi~'];

/**
 * Capi the capybara. Unlike the pools above, Capi picks a fresh line every time you interact,
 * so he doesn't repeat himself within one visit.
 */

/** When you click Capi while he's asleep (he's startled first, with "!!"). */
export const CAPI_WOKEN = ['hey im sleeping!', 'what? go focus on ur cards', 'five more minutes…', 'huh?? oh. hi.'];

/** When you click Capi while he's awake. */
export const CAPI_POKED = ['!!', 'what? go focus on ur cards', 'hehe', 'study time, not poke time', '…yes?'];

/** Mid-air, when Capi is thrown hard. */
export const CAPI_THROWN = ['AAAAAA', 'wheeeee!!', 'i can fly!!', 'NOT AGAIN'];

/** After a big throw, once Capi has landed. */
export const CAPI_LANDED = ['@_@ dizzy…', 'ok that was kinda fun', 'my bones…', 'again! again!', 'why would u do that'];

/** When you drop Capi somewhere after dragging him. */
export const CAPI_DROPPED = ['wheee', 'new spot, nice', 'put me down gently!!', 'ok i live here now'];

/* ------------------------------------------------------------------------------------------ */
/* Nothing below needs editing. */

const pickOnce = (pool: string[]) => pool[Math.floor(Math.random() * pool.length)] ?? '';

/** The lines chosen for this page load. */
export const MESSAGES = {
  tomato: pickOnce(TOMATO_NOTES),
  everyTen: pickOnce(EVERY_TEN),
  halfway: pickOnce(PROGRESS_HALFWAY),
  threeWrong: pickOnce(THREE_WRONG),
  fiveWrong: pickOnce(FIVE_WRONG),
  tenRight: pickOnce(TEN_RIGHT),
  deckFinished: pickOnce(DECK_FINISHED),
  outOfKeys: pickOnce(OUT_OF_KEYS),
  levelUp: pickOnce(LEVEL_UP),
};
