import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Play, Settings2 } from 'lucide-react';
import { formatAgo, todayKey } from '../lib/dates';
import { isNewCard, itemsOf } from '../lib/srs';
import { useData } from '../lib/store';
import type { AppData, DayKey } from '../lib/types';
import './DeckTable.css';

export interface DeckCounts {
  id: string;
  name: string;
  /** Cards never studied. */
  newCards: number;
  /** Cards studied at least once. */
  studied: number;
  /** Something is new or due today, so the deck name opens a study session. */
  waiting: boolean;
  cards: number;
  lastStudied: number | null;
}

export function deckCounts(data: AppData, today: DayKey): DeckCounts[] {
  return data.decks
    .map((deck) => {
      const cards = data.cards.filter((c) => c.deckId === deck.id);
      const newCards = cards.filter(isNewCard).length;
      let lastStudied: number | null = null;
      for (const r of data.reviews) if (r.deckId === deck.id && (lastStudied === null || r.ts > lastStudied)) lastStudied = r.ts;
      return {
        id: deck.id,
        name: deck.name,
        newCards,
        studied: cards.length - newCards,
        waiting: cards.some((c) => itemsOf(c).some((i) => i.srs.reps === 0 || i.srs.due <= today)),
        cards: cards.length,
        lastStudied,
      };
    })
    .sort((a, b) => (b.lastStudied ?? 0) - (a.lastStudied ?? 0) || a.name.localeCompare(b.name));
}

/** A column heading that shortens on phones; screen readers always hear the full text. */
function Heading({ full, short }: { full: string; short: string }) {
  return (
    <th scope="col" className="num">
      <span className="visually-hidden">{full}</span>
      <span className="deck-table-full" aria-hidden="true">
        {full}
      </span>
      <span className="deck-table-short" aria-hidden="true">
        {short}
      </span>
    </th>
  );
}

/** Decks with new and studied card counts, like a desk drawer of card boxes. */
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
            <Heading full="New cards" short="New" />
            <Heading full="Studied cards" short="Studied" />
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
              <span className="visually-hidden">Review</span>
            </th>
            <th scope="col">
              <span className="visually-hidden">Options</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">
                <Link to={r.waiting ? `/decks/${r.id}/study` : `/decks/${r.id}`} className="deck-table-name">
                  {r.name}
                </Link>
              </th>
              <td className={`num count-new${r.newCards ? '' : ' is-zero'}`}>{r.newCards}</td>
              <td className={`num count-due${r.studied ? '' : ' is-zero'}`}>{r.studied}</td>
              {detailed && (
                <>
                  <td className="num">{r.cards}</td>
                  <td className="num deck-table-when">{formatAgo(r.lastStudied)}</td>
                </>
              )}
              <td className="deck-table-review">
                <Link to={`/decks/${r.id}/study`} className="btn btn-sm" aria-label={`Review ${r.name}`}>
                  <Play size={14} aria-hidden="true" />
                  Review
                </Link>
              </td>
              <td className="deck-table-gear">
                <Link to={`/decks/${r.id}`} className="icon-btn" aria-label={`Open ${r.name}: cards and options`} title="Cards and options">
                  <Settings2 size={16} aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
