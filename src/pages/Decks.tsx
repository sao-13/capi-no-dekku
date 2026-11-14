import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, Layers, PenLine, Plus, Search } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { DeckTable } from '../components/DeckTable';
import { DeckFormDialog } from '../components/DeckFormDialog';
import { createDeck, useData } from '../lib/store';
import { addSampleDeck } from '../lib/sample';
import { plural } from '../lib/dates';

export function Decks() {
  const data = useData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const creating = params.get('new') === '1';


  const closeDialog = () => setParams({}, { replace: true });

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-row">
          <h1>Card repository</h1>
          {data.decks.length > 0 && (
            <div className="btn-row">
              <Link to="/studio" className="btn">
                <PenLine size={16} aria-hidden="true" />
                Card studio
              </Link>
              <button type="button" className="btn btn-primary" onClick={() => setParams({ new: '1' })}>
                <Plus size={16} aria-hidden="true" />
                New deck
              </button>
            </div>
          )}
        </div>
      </header>

      {data.decks.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No decks yet"
          actions={
            <>
              <button type="button" className="btn btn-primary" onClick={() => setParams({ new: '1' })}>
                <Plus size={16} aria-hidden="true" />
                New deck
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const deck = addSampleDeck();
                  navigate(`/decks/${deck.id}`);
                }}
              >
                <BookOpen size={16} aria-hidden="true" />
                Try a sample deck
              </button>
            </>
          }
        >
          A deck is a set of cards on one subject, like a chapter or an exam. Start one from scratch, or open a
          sample deck of literary terms to see how studying works.
        </EmptyState>
      ) : (
        <section className="section" aria-labelledby="deck-list-heading">
          <div className="section-head">
            <h2 id="deck-list-heading">
              {plural(data.decks.length, 'deck')}
            </h2>
            {data.decks.length > 4 && (
              <label className="search-field">
                <Search size={16} aria-hidden="true" />
                <span className="visually-hidden">Filter decks</span>
                <input
                  className="input"
                  type="search"
                  placeholder="Filter by name"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            )}
          </div>

          <DeckTable detailed filter={query} />
        </section>
      )}

      <DeckFormDialog
        open={creating}
        mode="create"
        onClose={closeDialog}
        onSubmit={(values) => {
          const deck = createDeck(values);
          navigate(`/decks/${deck.id}`, { replace: true });
        }}
      />
    </div>
  );
}
