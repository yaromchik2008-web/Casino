// Каскадний слот 6×5: виграш за 8+ однакових символів будь-де, виграшні зникають, згори падають нові.

export const COLS = 6;
export const ROWS = 5;

export interface TumbleSymbol {
  id: string;
  emoji: string;
  weight: number;
  pays: [number, number, number]; // × загальна ставка за 8–9, 10–11, 12+
}

export interface TumbleConfig {
  symbols: TumbleSymbol[];
  scatter: { emoji: string; weight: number; weightFree: number };
  bomb: { emoji: string; weightBase: number; weightFree: number };
  freeSpins: number;
  retrigger: number;
  buyCost: number; // × ставка за «Купити бонус»
}

export type Cell =
  | { kind: 'sym'; id: string; key: number }
  | { kind: 'scatter'; key: number }
  | { kind: 'bomb'; mult: number; key: number };

export type TGrid = Cell[][]; // grid[col][row], row 0 зверху

export interface StageWin {
  id: string;
  count: number;
  amount: number;
}

export interface Stage {
  grid: TGrid;
  remove: boolean[][]; // які клітинки лопаються на цьому кроці
  wins: StageWin[];
  win: number;
}

export interface TumbleResult {
  stages: Stage[]; // останній етап без виграшів
  baseWin: number; // сума каскадів до множників
  bombs: number[]; // множники бомб на полі в кінці (лише якщо був виграш)
  totalWin: number;
  scatters: number;
  freeSpinsWon: number;
  scatterWin: number;
}

const BOMB_VALUES: { v: number; w: number }[] = [
  { v: 2, w: 30 },
  { v: 3, w: 22 },
  { v: 5, w: 16 },
  { v: 10, w: 10 },
  { v: 15, w: 6 },
  { v: 20, w: 5 },
  { v: 25, w: 4 },
  { v: 50, w: 2 },
  { v: 100, w: 1 },
];

let keySeq = 1;

function pickWeighted<T>(items: T[], weight: (t: T) => number, rand: () => number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rand() * total;
  for (const t of items) {
    r -= weight(t);
    if (r < 0) return t;
  }
  return items[items.length - 1];
}

function randomCell(config: TumbleConfig, free: boolean, rand: () => number): Cell {
  const symTotal = config.symbols.reduce((s, x) => s + x.weight, 0);
  const sc = free ? config.scatter.weightFree : config.scatter.weight;
  const bomb = free ? config.bomb.weightFree : config.bomb.weightBase;
  const r = rand() * (symTotal + sc + bomb);
  if (r < sc) return { kind: 'scatter', key: keySeq++ };
  if (r < sc + bomb) return { kind: 'bomb', mult: pickWeighted(BOMB_VALUES, (b) => b.w, rand).v, key: keySeq++ };
  const s = pickWeighted(config.symbols, (x) => x.weight, rand);
  return { kind: 'sym', id: s.id, key: keySeq++ };
}

export function randomTGrid(config: TumbleConfig, free = false, rand: () => number = Math.random): TGrid {
  return Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => randomCell(config, free, rand)));
}

function payFor(sym: TumbleSymbol, count: number) {
  if (count >= 12) return sym.pays[2];
  if (count >= 10) return sym.pays[1];
  if (count >= 8) return sym.pays[0];
  return 0;
}

const SCATTER_PAYS: Record<number, number> = { 4: 3, 5: 5, 6: 100 };

export function playTumble(
  config: TumbleConfig,
  bet: number,
  free: boolean,
  rand: () => number = Math.random,
  forceScatters = 0,
): TumbleResult {
  let grid = randomTGrid(config, free, rand);
  if (forceScatters > 0) {
    // «Купити бонус»: гарантовано ставимо льодяники у випадкові колонки.
    const cols = Array.from({ length: COLS }, (_, i) => i).sort(() => rand() - 0.5).slice(0, forceScatters);
    for (const c of cols) grid[c][Math.floor(rand() * ROWS)] = { kind: 'scatter', key: keySeq++ };
  }
  const stages: Stage[] = [];
  let baseWin = 0;
  for (let guard = 0; guard < 40; guard++) {
    const counts: Record<string, number> = {};
    for (const col of grid) for (const c of col) if (c.kind === 'sym') counts[c.id] = (counts[c.id] ?? 0) + 1;
    const wins: StageWin[] = [];
    for (const sym of config.symbols) {
      const n = counts[sym.id] ?? 0;
      const p = payFor(sym, n);
      if (p > 0) wins.push({ id: sym.id, count: n, amount: p * bet });
    }
    const remove = grid.map((col) => col.map((c) => c.kind === 'sym' && wins.some((w) => w.id === c.id)));
    const win = wins.reduce((s, w) => s + w.amount, 0);
    stages.push({ grid, remove, wins, win });
    if (!wins.length) break;
    baseWin += win;
    // Каскад: лишаємо невиграшні (вони падають донизу), зверху нові.
    grid = grid.map((col, ci) => {
      const kept = col.filter((_, ri) => !remove[ci][ri]);
      const fresh = Array.from({ length: ROWS - kept.length }, () => randomCell(config, free, rand));
      return [...fresh, ...kept];
    });
  }
  const last = stages[stages.length - 1].grid;
  let scatters = 0;
  const bombs: number[] = [];
  for (const col of last)
    for (const c of col) {
      if (c.kind === 'scatter') scatters++;
      if (c.kind === 'bomb') bombs.push(c.mult);
    }
  // Льодяники рахуємо по всіх етапах: беремо максимум на полі.
  for (const st of stages) {
    let n = 0;
    for (const col of st.grid) for (const c of col) if (c.kind === 'scatter') n++;
    scatters = Math.max(scatters, n);
  }
  const usedBombs = baseWin > 0 ? bombs : [];
  const mult = usedBombs.reduce((s, b) => s + b, 0);
  const scatterWin = free ? 0 : (SCATTER_PAYS[Math.min(scatters, 6)] ?? 0) * bet;
  const totalWin = Math.round(baseWin * (mult > 0 ? mult : 1) + scatterWin);
  let freeSpinsWon = 0;
  if (!free && scatters >= 4) freeSpinsWon = config.freeSpins;
  if (free && scatters >= 3) freeSpinsWon = config.retrigger;
  return { stages, baseWin, bombs: usedBombs, totalWin, scatters, freeSpinsWon, scatterWin };
}

export function tumbleSymbols(emojis: string[], scale = 1): TumbleSymbol[] {
  // Від найдешевшого до найдорожчого.
  const weights = [20, 18, 16, 14, 12, 10, 8, 6, 4];
  const pays: [number, number, number][] = [
    [0.25, 0.75, 2],
    [0.4, 0.9, 4],
    [0.5, 1, 5],
    [0.8, 1.2, 8],
    [1, 1.5, 10],
    [1.5, 2, 12],
    [2, 5, 15],
    [2.5, 10, 25],
    [10, 25, 50],
  ];
  return emojis.map((emoji, i) => ({
    id: `t${i}`,
    emoji,
    weight: weights[i],
    pays: pays[i].map((p) => Math.round(p * scale * 100) / 100) as [number, number, number],
  }));
}
