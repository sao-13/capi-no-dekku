import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { formatAgo, todayKey } from '../lib/dates';
import { itemsOf } from '../lib/srs';
import { useData } from '../lib/store';
import type { AppData, DayKey } from '../lib/types';
import './DeckTable.css';

export interface DeckCounts {
  id: string;
  name: string;
  /** Items never studied. */
  fresh: number;
  /** Items being learned (forgotten or not yet past the first rung) and due now. */
  learn: number;
  /** Items in review and due today. */
  due: number;
  cards: number;
  lastStudied: number | null;
}

export function deckCounts(data: AppData, today: DayKey): DeckCounts[] {
  return data.decks
    .map((deck) => {
      const cards = data.cards.filter((c) => c.deckId === deck.id);
      const items = cards.flatMap(itemsOf);
      let lastStudied: number | null = null;
      for (const r of data.reviews) if (r.deckId === deck.id && (lastStudied === null || r.ts > lastStudied)) lastStudied = r.ts;
      return {
        id: deck.id,
        name: deck.name,
        fresh: items.filter((i) => i.srs.reps === 0).length,
        learn: items.filter((i) => i.srs.reps > 0 && i.srs.box === 0 && i.srs.due <= today).length,
        due: items.filter((i) => i.srs.reps > 0 && i.srs.box > 0 && i.srs.due <= today).length,
        cards: cards.length,
        lastStudied,
      };
    })
    .sort((a, b) => (b.lastStudied ?? 0) - (a.lastStudied ?? 0) || a.name.localeCompare(b.name));
}

/** Decks with New / Learn / Due counts, like a desk drawer of card boxes. */
export function DeckTable({ detailed = false, filter = '' }: { detailed?: boolean; filter?: string }) {
  const data = useData();
  const today = todayKey();
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return deckCounts(data, today).filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [data, today, filter]);

  if (!rows.length) return <p className="muted deck-table-empty">{filter ? `No deck names contain “${filter}”.` : 'No decks yet.'}</p>;

  return (
    <div className="deck-table-wrap">
      <table className="deck-table">
        <thead>
          <tr>
            <th scope="col">Deck</th>
            <th scope="col" className="num">
              New
            </th>
            <th scope="col" className="num">
              Learn
            </th>
            <th scope="col" className="num">
              Due
            </th>
            {detailed && (
              <>
                <th scope="col" className="num">
                  Cards
                </th>
                <th scope="col" className="num">
                  Last studied
                </th>
              </>
            )}
            <th scope="col">
              <span className="visually-hidden">Options</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const waiting = r.fresh + r.learn + r.due > 0;
            return (
              <tr key={r.id}>
                <th scope="row">
                  <Link to={waiting ? `/decks/${r.id}/study` : `/decks/${r.id}`} className="deck-table-name">
                    {r.name}
                  </Link>
                </th>
                <td className={`num count-new${r.fresh ? '' : ' is-zero'}`}>{r.fresh}</td>
                <td className={`num count-learn${r.learn ? '' : ' is-zero'}`}>{r.learn}</td>
                <td className={`num count-due${r.due ? '' : ' is-zero'}`}>{r.due}</td>
                {detailed && (
                  <>
                    <td className="num">{r.cards}</td>
                    <td className="num deck-table-when">{formatAgo(r.lastStudied)}</td>
                  </>
                )}
                <td className="deck-table-gear">
                  <Link to={`/decks/${r.id}`} className="icon-btn" aria-label={`Open ${r.name}: cards and options`} title="Cards and options">
                    <Settings2 size={16} aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
