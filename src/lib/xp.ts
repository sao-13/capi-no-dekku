import type { AppData } from './types';

/**
 * EXP is worked out from study history, so it's never out of sync and old reviews count too:
 *   correct answer +10, wrong answer +3 (showing up still counts),
 *   each finished quiz +20, each day studied +15.
 */
export const XP = { correct: 10, wrong: 3, quiz: 20, day: 15 } as const;

export function totalXp(data: AppData): number {
  let xp = 0;
  const days = new Set<string>();
  for (const r of data.reviews) {
    xp += r.correct ? XP.correct : XP.wrong;
    days.add(r.day);
  }
  return xp + data.quizzes.length * XP.quiz + days.size * XP.day;
}

/** Level n starts at 50·n·(n−1) EXP: 0, 100, 300, 600, 1000, … */
const levelStart = (n: number) => 50 * n * (n - 1);

export function levelInfo(xp: number) {
  let level = 1;
  while (levelStart(level + 1) <= xp) level++;
  const start = levelStart(level);
  const next = levelStart(level + 1);
  return { level, into: xp - start, span: next - start, total: xp };
}
