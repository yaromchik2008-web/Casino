// «Дурак підкидний» на двох. Стан — звичайний JSON, щоб його можна було зберігати на сервері для онлайн-гри.
import type { Suit } from './cards';

export interface DCard {
  r: number; // 2..14, туз = 14; джокер = 15
  s: Suit | 'J';
  red?: boolean; // колір джокера
}

export type DeckSize = 36 | 54;
export type Seat = 0 | 1;

export interface Pair {
  a: DCard;
  d?: DCard;
}

export interface DurakState {
  deckSize: DeckSize;
  deck: DCard[]; // беремо з початку, козирна карта — остання
  trump: Suit;
  trumpCard: DCard;
  hands: [DCard[], DCard[]];
  table: Pair[];
  attacker: Seat;
  /** attack: хід нападника (підкинути або «Бито»); defend: треба відбитись; taking: захисник бере, можна докинути. */
  phase: 'attack' | 'defend' | 'taking' | 'over';
  limit: number; // скільки карт можна підкинути в цьому відбої
  discard: number;
  /** Хто програв (дурак). -1 — нічия. */
  loser: Seat | -1 | null;
  last?: string;
}

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export const HAND = 6;

export const isJoker = (c: DCard) => c.s === 'J';
export const sameCard = (a: DCard, b: DCard) => a.r === b.r && a.s === b.s && !!a.red === !!b.red;

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeDeck(size: DeckSize): DCard[] {
  const from = size === 36 ? 6 : 2;
  const deck: DCard[] = [];
  for (const s of SUITS) for (let r = from; r <= 14; r++) deck.push({ r, s });
  if (size === 54) deck.push({ r: 15, s: 'J', red: true }, { r: 15, s: 'J', red: false });
  shuffle(deck);
  // Козир визначає остання карта, тож джокер туди не кладемо.
  const k = deck.findIndex((c) => !isJoker(c));
  const last = deck.length - 1;
  [deck[k], deck[last]] = [deck[last], deck[k]];
  return deck;
}

/** Чи б'є карта d карту a. Джокер б'є все, а сам джокер може побити лише інший джокер. */
export function beats(d: DCard, a: DCard, trump: Suit) {
  if (isJoker(d)) return true;
  if (isJoker(a)) return false;
  if (d.s === a.s) return d.r > a.r;
  return d.s === trump && a.s !== trump;
}

/** Сила карти для сортування і для бота. */
export function power(c: DCard, trump: Suit) {
  if (isJoker(c)) return 100 + (c.red ? 1 : 0);
  return c.r + (c.s === trump ? 20 : 0);
}

export function sortHand(hand: DCard[], trump: Suit) {
  return [...hand].sort((x, y) => power(x, trump) - power(y, trump) || String(x.s).localeCompare(String(y.s)));
}

function lowestTrump(hand: DCard[], trump: Suit) {
  return Math.min(99, ...hand.filter((c) => c.s === trump).map((c) => c.r));
}

export function newGame(size: DeckSize): DurakState {
  const deck = makeDeck(size);
  const hands: [DCard[], DCard[]] = [deck.splice(0, HAND), deck.splice(0, HAND)];
  const trumpCard = deck[deck.length - 1];
  const trump = trumpCard.s as Suit;
  // Першим ходить той, у кого молодший козир.
  const attacker: Seat = lowestTrump(hands[1], trump) < lowestTrump(hands[0], trump) ? 1 : 0;
  return {
    deckSize: size,
    deck,
    trump,
    trumpCard,
    hands,
    table: [],
    attacker,
    phase: 'attack',
    limit: Math.min(HAND, hands[1 - attacker].length),
    discard: 0,
    loser: null,
  };
}

export const defenderOf = (s: DurakState): Seat => (1 - s.attacker) as Seat;

/** Чий зараз хід. */
export function turnOf(s: DurakState): Seat | null {
  if (s.phase === 'over') return null;
  return s.phase === 'defend' ? defenderOf(s) : s.attacker;
}

function tableRanks(s: DurakState) {
  const ranks = new Set<number>();
  for (const p of s.table) {
    if (!isJoker(p.a)) ranks.add(p.a.r);
    if (p.d && !isJoker(p.d)) ranks.add(p.d.r);
  }
  return ranks;
}

/** Чи може нападник покласти цю карту. Джокера можна підкинути будь-коли. */
export function canAttack(s: DurakState, c: DCard) {
  if (s.phase !== 'attack' && s.phase !== 'taking') return false;
  if (s.table.length === 0) return s.phase === 'attack';
  if (s.table.length >= s.limit) return false;
  return isJoker(c) || tableRanks(s).has(c.r);
}

export function openAttack(s: DurakState) {
  return s.table.find((p) => !p.d);
}

export function canDefend(s: DurakState, c: DCard) {
  const open = openAttack(s);
  return s.phase === 'defend' && !!open && beats(c, open.a, s.trump);
}

function clone(s: DurakState): DurakState {
  return JSON.parse(JSON.stringify(s));
}

function removeCard(hand: DCard[], c: DCard) {
  const i = hand.findIndex((h) => sameCard(h, c));
  if (i < 0) throw new Error('no card');
  hand.splice(i, 1);
}

function refill(s: DurakState) {
  for (const seat of [s.attacker, defenderOf(s)]) {
    const hand = s.hands[seat];
    while (hand.length < HAND && s.deck.length) hand.push(s.deck.shift()!);
  }
}

function checkOver(s: DurakState) {
  if (s.deck.length) return;
  const empty0 = s.hands[0].length === 0;
  const empty1 = s.hands[1].length === 0;
  if (empty0 && empty1) s.loser = -1;
  else if (empty0) s.loser = 1;
  else if (empty1) s.loser = 0;
  else return;
  s.phase = 'over';
}

function startBout(s: DurakState, attacker: Seat) {
  s.table = [];
  s.attacker = attacker;
  s.phase = 'attack';
  s.limit = Math.min(HAND, s.hands[defenderOf(s)].length);
  checkOver(s);
}

/** Відбій: усі карти побиті, нападником стає захисник. */
function endBeaten(s: DurakState) {
  s.discard += s.table.length * 2;
  refill(s);
  s.last = 'Бито';
  startBout(s, defenderOf(s));
}

/** Захисник забирає всі карти зі столу, нападник ходить знову. */
function endTaken(s: DurakState) {
  const def = defenderOf(s);
  for (const p of s.table) {
    s.hands[def].push(p.a);
    if (p.d) s.hands[def].push(p.d);
  }
  refill(s);
  s.last = 'Забрав карти';
  startBout(s, s.attacker);
}

/** Після ходу перевіряємо, чи відбій закінчився сам собою. */
function settle(s: DurakState) {
  const def = defenderOf(s);
  if (s.phase === 'attack' && s.table.length) {
    const allBeaten = s.table.every((p) => p.d);
    const attackerOut = s.hands[s.attacker].length === 0 || s.table.length >= s.limit;
    // Захисник відбив усе й карт у нього не лишилось, або нападнику нічим/вже не можна підкинути.
    if (allBeaten && (s.hands[def].length === 0 || attackerOut)) endBeaten(s);
  } else if (s.phase === 'taking') {
    if (s.hands[s.attacker].length === 0 || s.table.length >= s.limit) endTaken(s);
  }
  return s;
}

export type Move = { type: 'attack'; card: DCard } | { type: 'defend'; card: DCard } | { type: 'take' } | { type: 'done' };

/** Застосовує хід гравця seat. Кидає помилку, якщо хід неможливий. */
export function applyMove(prev: DurakState, seat: Seat, move: Move): DurakState {
  if (turnOf(prev) !== seat) throw new Error('not your turn');
  const s = clone(prev);
  s.last = undefined;
  if (move.type === 'attack') {
    if (!canAttack(s, move.card)) throw new Error('bad attack');
    removeCard(s.hands[seat], move.card);
    s.table.push({ a: move.card });
    if (s.phase === 'attack') s.phase = 'defend';
  } else if (move.type === 'defend') {
    if (!canDefend(s, move.card)) throw new Error('bad defend');
    removeCard(s.hands[seat], move.card);
    openAttack(s)!.d = move.card;
    s.phase = 'attack';
  } else if (move.type === 'take') {
    if (s.phase !== 'defend') throw new Error('bad take');
    s.phase = 'taking';
  } else {
    if (s.phase === 'attack' && s.table.length && s.table.every((p) => p.d)) endBeaten(s);
    else if (s.phase === 'taking') endTaken(s);
    else throw new Error('bad done');
    return s;
  }
  return settle(s);
}

/** Ходи, які зараз доступні гравцю (для бота і підсвітки). */
export function legalMoves(s: DurakState, seat: Seat): Move[] {
  if (turnOf(s) !== seat) return [];
  const hand = s.hands[seat];
  const moves: Move[] = [];
  if (s.phase === 'defend') {
    for (const c of hand) if (canDefend(s, c)) moves.push({ type: 'defend', card: c });
    moves.push({ type: 'take' });
  } else {
    for (const c of hand) if (canAttack(s, c)) moves.push({ type: 'attack', card: c });
    if (s.table.length) moves.push({ type: 'done' });
  }
  return moves;
}

/** Простий, але не дурний бот. */
export function botMove(s: DurakState, seat: Seat): Move {
  const moves = legalMoves(s, seat);
  const t = s.trump;
  const late = s.deck.length === 0;
  const cost = (c: DCard) => power(c, t);
  if (s.phase === 'defend') {
    const defends = moves.filter((m): m is Extract<Move, { type: 'defend' }> => m.type === 'defend').sort((x, y) => cost(x.card) - cost(y.card));
    const best = defends[0];
    if (!best) return { type: 'take' };
    const open = openAttack(s)!;
    // Не палимо джокера і старших козирів на дрібноту, поки колода ще велика.
    if (!late && isJoker(best.card) && s.deck.length > 4) return { type: 'take' };
    if (!late && best.card.s === t && open.a.s !== t && best.card.r >= 12 && s.deck.length > 8 && s.table.length <= 1) return { type: 'take' };
    return best;
  }
  const attacks = moves.filter((m): m is Extract<Move, { type: 'attack' }> => m.type === 'attack').sort((x, y) => cost(x.card) - cost(y.card));
  if (s.table.length === 0) return attacks[0];
  // Підкидаємо дешеві карти; козирі й джокерів — лише наприкінці гри.
  const cheap = attacks.find((m) => late || (m.card.s !== t && !isJoker(m.card) && m.card.r <= 11));
  return cheap ?? { type: 'done' };
}

export function cardLabel(c: DCard) {
  if (isJoker(c)) return '🃏';
  return `${({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[c.r] ?? c.r}${c.s}`;
}
