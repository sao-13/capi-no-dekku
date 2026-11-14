import { addCards, createDeck } from './store';
import type { Deck } from './types';

const SAMPLE_CARDS: { front: string; back: string }[] = [
  { front: 'Metaphor', back: 'A comparison that says one thing is another, without "like" or "as".' },
  { front: 'Simile', back: 'A comparison made explicit with "like" or "as".' },
  { front: 'Synecdoche', back: 'A part standing in for the whole, as in "all hands on deck".' },
  { front: 'Metonymy', back: 'Naming something by a thing closely tied to it, as in "the Crown" for the monarchy.' },
  { front: 'Anaphora', back: 'Repeating the same word or phrase at the start of successive clauses.' },
  { front: 'Enjambment', back: 'A sentence that runs past the end of a line of verse without a pause.' },
  { front: 'Zeugma', back: 'One word governing two others in different senses: "she lost her keys and her temper".' },
  { front: 'Litotes', back: 'Understatement by denying the opposite, as in "not bad at all".' },
  { front: 'Chiasmus', back: 'Repeating a phrase with its parts reversed: "eat to live, not live to eat".' },
  { front: 'Free indirect discourse', back: "Third-person narration that slips into a character's own voice and thoughts." },
  { front: 'Bathos', back: 'An abrupt drop from the lofty to the trivial, usually for comic effect.' },
  { front: 'Apostrophe', back: 'Addressing someone absent, or something inanimate, as if it could answer.' },
];

export function addSampleDeck(): Deck {
  const deck = createDeck({
    name: 'Literary devices',
    description: 'Twelve terms that come up again and again in close reading.',
  });
  addCards(deck.id, SAMPLE_CARDS);
  return deck;
}
