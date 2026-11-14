import './Streaks.css';
import { Flame } from 'lucide-react';
import { useMemo } from 'react';
import { useData } from '../lib/store';
import { activityByDay, streakInfo } from '../lib/stats';
import { todayKey } from '../lib/dates';

export function StreakChip({ compact = false }: { compact?: boolean }) {
  const { reviews } = useData();
  const streak = useMemo(() => streakInfo(activityByDay(reviews), todayKey()), [reviews]);
  if (streak.current === 0) return null;

  const label = `${streak.current}-day streak`;

  if (compact) {
    return (
      <span className="streak-chip is-compact" aria-label={streak.atRisk ? `${label}. Study today to keep it.` : label} title={label}>
        <Flame size={16} aria-hidden="true" />
        {streak.current}
      </span>
    );
  }

  return (
    <div className="streak-chip">
      <Flame size={16} aria-hidden="true" />
      <div>
        <p className="streak-chip-count">{label}</p>
        {streak.atRisk && <p className="streak-chip-note">Study today to keep it</p>}
      </div>
    </div>
  );
}
