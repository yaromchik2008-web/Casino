// Бонуска «Утримай і виграй»: монети фіксуються, кожна нова скидає лічильник обертів на 3.

export const HW_COLS = 5;
export const HW_ROWS = 5; // повне поле бонуса; основна гра бачить нижні 3 ряди
export const BASE_ROWS = 3;
export const TRIGGER_COINS = 6;
export const BASE_COIN_CHANCE = 0.125; // RTP ≈ 0.91 при виплатах ×0.8 (симуляція: лінії 0.43 + бонус 0.48, бонус ≈ 1 на 140 обертів)
export const RESPINS = 3;
export const UNLOCK_AT = [5, 10]; // нових монет, щоб відкрити 4-й і 5-й ряд

export type CoinType = 'value' | 'mini' | 'minor' | 'major' | 'boost' | 'x2' | 'collect';

export interface HCoin {
  type: CoinType;
  value: number; // × ставка
  key: number;
}

export const JACKPOTS = { mini: 10, minor: 25, major: 100, grand: 1000 } as const;

export const COIN_LABEL: Record<CoinType, string> = {
  value: '',
  mini: 'МІНІ',
  minor: 'МІНОР',
  major: 'МАЖОР',
  boost: 'БУСТ',
  x2: '×2',
  collect: 'ЗБІР',
};

const VALUES: { v: number; w: number }[] = [
  { v: 1, w: 30 },
  { v: 2, w: 25 },
  { v: 3, w: 15 },
  { v: 5, w: 12 },
  { v: 8, w: 8 },
  { v: 10, w: 5 },
  { v: 15, w: 3 },
  { v: 20, w: 1.5 },
  { v: 30, w: 0.5 },
];

let keySeq = 1;

function pick<T>(items: T[], w: (t: T) => number, rand: () => number): T {
  const total = items.reduce((s, t) => s + w(t), 0);
  let r = rand() * total;
  for (const t of items) {
    r -= w(t);
    if (r < 0) return t;
  }
  return items[items.length - 1];
}

function valueCoin(rand: () => number): HCoin {
  return { type: 'value', value: pick(VALUES, (x) => x.w, rand).v, key: keySeq++ };
}

/** Монета в основній грі: звичайна або джекпот (без особливих). */
export function baseCoin(rand: () => number = Math.random): HCoin {
  const r = rand();
  if (r < 0.004) return { type: 'major', value: JACKPOTS.major, key: keySeq++ };
  if (r < 0.02) return { type: 'minor', value: JACKPOTS.minor, key: keySeq++ };
  if (r < 0.06) return { type: 'mini', value: JACKPOTS.mini, key: keySeq++ };
  return valueCoin(rand);
}

/** Монета під час бонуса: можуть випасти особливі. */
export function bonusCoin(rand: () => number = Math.random): HCoin {
  const r = rand();
  if (r < 0.06) return { type: 'boost', value: pick(VALUES.slice(0, 5), (x) => x.w, rand).v, key: keySeq++ };
  if (r < 0.1) return { type: 'x2', value: 0, key: keySeq++ };
  if (r < 0.14) return { type: 'collect', value: 0, key: keySeq++ };
  return baseCoin(rand);
}

export interface Bonus {
  cells: (HCoin | null)[]; // індекс row * HW_COLS + col
  firstOpenRow: number; // ряди вище за цей заблоковані
  respins: number;
  collected: number; // нових монет за бонус
  grand: boolean;
}

export function startBonus(baseCoins: (HCoin | null)[]): Bonus {
  // baseCoins: 3 ряди × 5 колонок основної гри → нижні ряди поля.
  const cells: (HCoin | null)[] = Array(HW_COLS * HW_ROWS).fill(null);
  const offset = (HW_ROWS - BASE_ROWS) * HW_COLS;
  baseCoins.forEach((c, i) => {
    if (c) cells[offset + i] = c;
  });
  return { cells, firstOpenRow: HW_ROWS - BASE_ROWS, respins: RESPINS, collected: 0, grand: false };
}

export interface RespinEvent {
  index: number;
  coin: HCoin;
}

export interface RespinResult {
  bonus: Bonus;
  landed: RespinEvent[];
  unlocked: boolean;
  done: boolean;
}

export const NEW_COIN_CHANCE = 0.06;

function applySpecial(cells: (HCoin | null)[], index: number) {
  const coin = cells[index]!;
  if (coin.type === 'boost') {
    cells.forEach((c, i) => {
      if (c && i !== index && c.type !== 'x2' && c.type !== 'collect') cells[i] = { ...c, value: c.value + coin.value };
    });
  } else if (coin.type === 'x2') {
    cells.forEach((c, i) => {
      if (c && i !== index) cells[i] = { ...c, value: c.value * 2 };
    });
  } else if (coin.type === 'collect') {
    const sum = cells.reduce((s, c, i) => s + (c && i !== index ? c.value : 0), 0);
    cells[index] = { ...coin, value: sum };
  }
}

export function respin(b: Bonus, rand: () => number = Math.random): RespinResult {
  const cells = [...b.cells];
  const landed: RespinEvent[] = [];
  for (let i = b.firstOpenRow * HW_COLS; i < cells.length; i++) {
    if (!cells[i] && rand() < NEW_COIN_CHANCE) {
      cells[i] = bonusCoin(rand);
      landed.push({ index: i, coin: cells[i]! });
    }
  }
  for (const ev of landed) applySpecial(cells, ev.index);
  const collected = b.collected + landed.length;
  let firstOpenRow = b.firstOpenRow;
  for (let k = 0; k < UNLOCK_AT.length; k++) {
    const row = HW_ROWS - BASE_ROWS - 1 - k;
    if (collected >= UNLOCK_AT[k] && firstOpenRow > row) firstOpenRow = row;
  }
  const unlocked = firstOpenRow !== b.firstOpenRow;
  const full = cells.every(Boolean);
  const respins = landed.length > 0 ? RESPINS : b.respins - 1;
  const done = full || respins <= 0;
  for (const ev of landed) ev.coin = cells[ev.index]!;
  return { bonus: { cells, firstOpenRow, respins, collected, grand: full }, landed, unlocked, done };
}

export function bonusTotal(b: Bonus) {
  return b.cells.reduce((s, c) => s + (c ? c.value : 0), 0) + (b.grand ? JACKPOTS.grand : 0);
}
