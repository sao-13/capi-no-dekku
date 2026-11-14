import { useCallback, useRef, useState } from 'react';
import { MESSAGES } from '../content/messages';
import { showPopup } from './popup';
import { ding } from './sound';
import { XP } from './xp';

/**
 * Feedback for a study or quiz session: the correct-answer ding, a floating "+EXP",
 * and the pop-ups for streaks of right or wrong answers, every ten answers, halfway and done.
 */
export function useSessionCheers() {
  const total = useRef(0);
  const rightRun = useRef(0);
  const wrongRun = useRef(0);
  const halfwayShown = useRef(false);
  const [gain, setGain] = useState<{ id: number; amount: number } | null>(null);

  const record = useCallback((correct: boolean) => {
    total.current += 1;
    if (correct) {
      rightRun.current += 1;
      wrongRun.current = 0;
      ding();
    } else {
      wrongRun.current += 1;
      rightRun.current = 0;
    }
    setGain({ id: total.current, amount: correct ? XP.correct : XP.wrong });

    // One pop-up at a time; the most pressing wins.
    if (wrongRun.current === 5) showPopup(MESSAGES.fiveWrong, 'warn', 4200);
    else if (wrongRun.current === 3) showPopup(MESSAGES.threeWrong, 'warn');
    else if (rightRun.current > 0 && rightRun.current % 10 === 0) showPopup(MESSAGES.tenRight);
    else if (total.current % 10 === 0) showPopup(MESSAGES.everyTen);
  }, []);

  /** Call with the session's progress (0 to 1); pops the halfway message once. */
  const progress = useCallback((fraction: number) => {
    if (!halfwayShown.current && fraction >= 0.5 && fraction < 1) {
      halfwayShown.current = true;
      showPopup(MESSAGES.halfway);
    }
  }, []);

  const finished = useCallback(() => showPopup(MESSAGES.deckFinished), []);

  const reset = useCallback(() => {
    total.current = 0;
    rightRun.current = 0;
    wrongRun.current = 0;
    halfwayShown.current = false;
  }, []);

  return { record, progress, finished, reset, gain };
}
