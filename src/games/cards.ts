export type Suit = '♠' | '♥' | '♦' | '♣';

export interface Card {
  rank: number; // 2..14, туз = 14
  suit: Suit;
}

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

export function newDeck(decks = 1): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++)
    for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) cards.push({ rank, suit });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function rankLabel(rank: number): string {
  return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[rank] ?? String(rank);
}

export function isRed(card: Card): boolean {
  return card.suit === '♥' || card.suit === '♦';
}
