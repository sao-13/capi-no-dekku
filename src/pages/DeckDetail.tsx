import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, FileUp, FolderOpen, ListChecks, NotebookPen, Pencil, Play, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { CardEditor } from '../components/CardEditor';
import { CardSummary } from '../components/CardContent';
import { draftFromCard, draftToInput, emptyDraft, nextDraft, validateDraft, type CardDraft } from '../lib/draft';
import { plainText } from '../lib/markup';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/Dialog';
import { DeckFormDialog } from '../components/DeckFormDialog';
import { addCard, deleteCard, deleteDeck, resetCards, restoreCard, restoreSchedules, updateCard, updateDeck, useData } from '../lib/store';
import { cardsInDeck, summarizeDeck } from '../lib/deckStats';
import { CATEGORY_LABEL, cardCategory, isNewCard, latestGrades, TYPE_LABEL, typeOf, type CardCategory } from '../lib/srs';
import { plural } from '../lib/dates';
import { showToast } from '../lib/toast';
import type { Card, CardType } from '../lib/types';
import './DeckDetail.css';

export function DeckDetail() {
  const { deckId = '' } = useParams();
  const data = useData();
  const navigate = useNavigate();
  const deck = data.decks.find((d) => d.id === deckId);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CardCategory | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<CardType | 'all'>('all');
  const [announcement, setAnnouncement] = useState('');

  const cards = useMemo(() => cardsInDeck(data, deckId), [data, deckId]);
  const summary = useMemo(() => summarizeDeck(data, deckId), [data, deckId]);
  const grades = useMemo(() => latestGrades(data.reviews), [data.reviews]);
  const categories = useMemo(() => new Map(cards.map((c) => [c.id, cardCategory(c, grades)])), [cards, grades]);
  const visibleCards = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return cards.filter(
      (c) =>
        (!q || c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)) &&
        (categoryFilter === 'all' || categories.get(c.id) === categoryFilter) &&
        (typeFilter === 'all' || typeOf(c) === typeFilter),
    );
  }, [cards, filter, categoryFilter, typeFilter, categories]);
  const filtering = filter.trim() !== '' || categoryFilter !== 'all' || typeFilter !== 'all';

  if (!deck) {
    return (
      <div className="page">
        <EmptyState
          icon={FolderOpen}
          title="This deck isn't here anymore"
          headingLevel="h1"
          actions={
            <Link to="/decks" className="btn">
              See all decks
            </Link>
          }
        >
          It may have been deleted, or the link is from a different browser. Decks are saved on the device where you
          made them.
        </EmptyState>
      </div>
    );
  }

  const focusCardsHeading = () => requestAnimationFrame(() => document.getElementById('cards-heading')?.focus());

  function clearFilters() {
    setFilter('');
    setCategoryFilter('all');
    setTypeFilter('all');
    focusCardsHeading();
  }

  return (
    <div className="page">
      <header className="page-head deck-head">
        <Link to="/decks" className="breadcrumb">
          <ArrowLeft size={16} aria-hidden="true" />
          All decks
        </Link>
        <div className="deck-title-row">
          <h1>{deck.name}</h1>
          <div className="btn-row deck-admin">
            <button type="button" className="btn btn-quiet" onClick={() => setEditing(true)}>
              <Pencil size={16} aria-hidden="true" />
              Edit details
            </button>
            {summary.studied > 0 && (
              <button type="button" className="btn btn-quiet" onClick={() => setConfirmingReset(true)}>
                <RotateCcw size={16} aria-hidden="true" />
                Reset studied cards
              </button>
            )}
            <button type="button" className="btn btn-quiet btn-danger" onClick={() => setConfirmingDelete(true)}>
              <Trash2 size={16} aria-hidden="true" />
              Delete deck
            </button>
          </div>
        </div>
        {deck.description && <p className="page-lede">{deck.description}</p>}
        <p className="deck-summary">
          {cards.length === 0
            ? 'No cards yet.'
            : `${plural(summary.total, 'card')}. ${summary.fresh} new, ${summary.studied} studied.`}
        </p>
        {cards.length > 0 && (
          <div className="btn-row deck-actions">
            <Link to={`/decks/${deck.id}/study`} className="btn btn-primary btn-lg">
              <Play size={16} aria-hidden="true" />
              Review
            </Link>
            <Link to={`/decks/${deck.id}/quiz`} className="btn btn-lg">
              <ListChecks size={16} aria-hidden="true" />
              Take a quiz
            </Link>
            <Link to={`/studio?deck=${deck.id}`} className="btn btn-lg">
              <FileUp size={16} aria-hidden="true" />
              Make cards from a file
            </Link>
          </div>
        )}
      </header>

      <section className="section" aria-labelledby="add-card-heading">
        <div className="section-head">
          <h2 id="add-card-heading">Add a card</h2>
        </div>
        <AddCardForm
          deckId={deck.id}
          onAdded={() => setAnnouncement(`Card added. ${plural(cards.length + 1, 'card')} in this deck.`)}
        />
      </section>

      <section className="section" aria-labelledby="cards-heading">
        <div className="section-head deck-cards-head">
          <h2 id="cards-heading" tabIndex={-1}>
            Cards
          </h2>
          {(cards.length > 6 || filtering) && (
            <div className="card-filters">
              <label className="search-field">
                <Search size={16} aria-hidden="true" />
                <span className="visually-hidden">Filter cards</span>
                <input
                  className="input"
                  type="search"
                  placeholder="Filter cards"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
              <label className="visually-hidden" htmlFor="card-filter-category">
                Category
              </label>
              <select
                id="card-filter-category"
                className="select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as CardCategory | 'all')}
              >
                <option value="all">All categories</option>
                {(Object.keys(CATEGORY_LABEL) as CardCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {CATEGORY_LABEL[k]}
                  </option>
                ))}
              </select>
              <label className="visually-hidden" htmlFor="card-filter-type">
                Card type
              </label>
              <select
                id="card-filter-type"
                className="select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as CardType | 'all')}
              >
                <option value="all">All types</option>
                {(Object.keys(TYPE_LABEL) as CardType[]).map((k) => (
                  <option key={k} value={k}>
                    {TYPE_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {cards.length === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title="This deck has no cards"
            actions={
              <Link to={`/studio?deck=${deck.id}`} className="btn">
                <FileUp size={16} aria-hidden="true" />
                Make cards from a file
              </Link>
            }
          >
            Write the first one above. Or open your notes in the card studio, highlight what matters, and turn it into
            cards as you read.
          </EmptyState>
        ) : visibleCards.length === 0 ? (
          <div className="card-filter-empty">
            <p className="muted">
              {categoryFilter === 'all' && typeFilter === 'all' ? `No cards contain "${filter}".` : 'No cards match these filters.'}
            </p>
            <button type="button" className="btn btn-sm" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <ol className="card-list">
            {visibleCards.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                category={categories.get(card.id) ?? 'new'}
                onReset={() => {
                  const previous = resetCards([card.id]);
                  if (previous.length)
                    showToast('Card reset to new.', { action: { label: 'Undo', onClick: () => restoreSchedules(previous) } });
                }}
                onDelete={() => {
                  const removed = deleteCard(card.id);
                  if (removed) showToast('Card deleted.', { action: { label: 'Undo', onClick: () => restoreCard(removed) } });
                  // The row and its button are gone; keep keyboard users anchored in the card list.
                  requestAnimationFrame(() => document.getElementById('cards-heading')?.focus());
                }}
              />
            ))}
          </ol>
        )}
      </section>

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      <DeckFormDialog
        open={editing}
        mode="edit"
        initial={{ name: deck.name, description: deck.description }}
        onClose={() => setEditing(false)}
        onSubmit={(values) => {
          updateDeck(deck.id, values);
          setEditing(false);
          showToast('Deck details saved.');
        }}
      />
      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete "${deck.name}"?`}
        body={
          cards.length
            ? `Its ${plural(cards.length, 'card')} will be deleted too. Your study history stays in your streak and activity grid. This can't be undone.`
            : "This can't be undone."
        }
        confirmLabel="Delete deck"
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => {
          deleteDeck(deck.id);
          showToast(`Deleted "${deck.name}".`);
          navigate('/decks', { replace: true });
        }}
      />
      <ConfirmDialog
        open={confirmingReset}
        title={`Reset ${plural(summary.studied, 'studied card')} to new?`}
        body="They will be asked as new cards again. Your streak, EXP and activity history stay as they are."
        confirmLabel="Reset cards"
        cancelLabel="Cancel"
        onClose={() => setConfirmingReset(false)}
        onConfirm={() => {
          const previous = resetCards(cards.filter((c) => !isNewCard(c)).map((c) => c.id));
          setConfirmingReset(false);
          showToast(`${plural(previous.length, 'card')} reset to new.`);
          // The button that opened the dialog is gone now that nothing is studied.
          focusCardsHeading();
        }}
      />
    </div>
  );
}

function AddCardForm({ deckId, onAdded }: { deckId: string; onAdded: () => void }) {
  const [draft, setDraft] = useState<CardDraft>(() => emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function submit() {
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      addCard(deckId, await draftToInput(draft));
      setDraft(nextDraft(draft));
      setError(null);
      onAdded();
      requestAnimationFrame(() => wrapRef.current?.querySelector<HTMLElement>('textarea, input')?.focus());
    } catch {
      setError('The image couldn’t be saved in this browser. Check that storage isn’t full or blocked, then try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="add-card" ref={wrapRef}>
      <CardEditor
        idPrefix="new"
        value={draft}
        onChange={(d) => {
          setDraft(d);
          if (error) setError(null);
        }}
        onSubmit={submit}
        error={error}
      />
      <div className="add-card-foot">
        <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Add card'}
        </button>
        <p className="field-hint">
          <kbd>Ctrl</kbd> + <kbd>Enter</kbd> adds the card from any box.
        </p>
      </div>
    </div>
  );
}

const CATEGORY_TAG: Record<CardCategory, string> = { new: '', easy: ' is-mastered', recall: '', weak: ' is-due' };

function CardRow({
  card,
  category,
  onReset,
  onDelete,
}: {
  card: Card;
  category: CardCategory;
  onReset: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CardDraft>(() => draftFromCard(card));
  const [error, setError] = useState<string | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const type = typeOf(card);
  const label = plainText(card.front).slice(0, 60) || TYPE_LABEL[type];

  async function save() {
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    updateCard(card.id, await draftToInput(draft));
    setEditing(false);
    requestAnimationFrame(() => editButton.current?.focus());
  }

  function cancel() {
    setDraft(draftFromCard(card));
    setError(null);
    setEditing(false);
    requestAnimationFrame(() => editButton.current?.focus());
  }

  if (editing) {
    return (
      <li
        className="card-row is-editing"
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
        }}
      >
        <CardEditor idPrefix={`edit-${card.id}`} value={draft} onChange={setDraft} onSubmit={save} error={error} autoFocus />
        <div className="btn-row">
          <button type="button" className="btn btn-primary btn-sm" onClick={save}>
            <Check size={14} aria-hidden="true" />
            Save card
          </button>
          <button type="button" className="btn btn-sm" onClick={cancel}>
            <X size={14} aria-hidden="true" />
            Cancel
          </button>
          {draft.type !== type && <p className="field-hint">Changing the type keeps this card’s review history.</p>}
        </div>
      </li>
    );
  }

  return (
    <li className="card-row">
      <CardSummary card={card} />
      <div className="card-meta">
        {type !== 'basic' && <span className="tag">{TYPE_LABEL[type]}</span>}
        <span className={`tag${CATEGORY_TAG[category]}`}>
          <span className="tag-dot" aria-hidden="true" />
          {CATEGORY_LABEL[category]}
        </span>
        <button
          ref={editButton}
          type="button"
          className="icon-btn"
          aria-label={`Edit card: ${label}`}
          title="Edit"
          onClick={() => {
            setDraft(draftFromCard(card));
            setEditing(true);
          }}
        >
          <Pencil size={16} aria-hidden="true" />
        </button>
        {category !== 'new' && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Reset this card to new"
            title="Reset to new"
            onClick={() => {
              onReset();
              // The reset button leaves with the card's studied state, and a filter may hide the whole row.
              requestAnimationFrame(() => (editButton.current ?? document.getElementById('cards-heading'))?.focus());
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        )}
        <button type="button" className="icon-btn danger" aria-label={`Delete card: ${label}`} title="Delete" onClick={onDelete}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
