export interface SlotSymbol {
  id: string;
  emoji: string;
  weight: number;
  pays: number[]; // множники лінійної ставки за 3, 4, 5 однакових
}

export interface SlotConfig {
  reels: 3 | 5;
  symbols: SlotSymbol[];
  wild?: string;
  scatter?: string;
  jackpotSymbol?: string;
}

export const ROWS = 3;

const LINES_3: number[][] = [
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
];

const LINES_5: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
];

export const FREE_SPINS_AWARD = 8;

export function paylines(config: SlotConfig): number[][] {
  return config.reels === 3 ? LINES_3 : LINES_5;
}

export type Grid = SlotSymbol[][]; // grid[reel][row]

export function randomSymbol(config: SlotConfig, rand: () => number = Math.random): SlotSymbol {
  const total = config.symbols.reduce((sum, s) => sum + s.weight, 0);
  let roll = rand() * total;
  for (const s of config.symbols) {
    roll -= s.weight;
    if (roll < 0) return s;
  }
  return config.symbols[0];
}

export function spinGrid(config: SlotConfig, rand: () => number = Math.random): Grid {
  return Array.from({ length: config.reels }, () =>
    Array.from({ length: ROWS }, () => randomSymbol(config, rand)),
  );
}

export interface LineWin {
  line: number;
  count: number;
  symbol: SlotSymbol;
  win: number;
}

export interface SlotResult {
  win: number;
  lineWins: LineWin[];
  scatterCount: number;
  freeSpins: number;
  jackpot: boolean;
}

export function evaluateGrid(config: SlotConfig, grid: Grid, bet: number): SlotResult {
  const lines = paylines(config);
  const lineBet = bet / lines.length;
  const lineWins: LineWin[] = [];

  lines.forEach((rows, lineIndex) => {
    const cells = rows.map((row, reel) => grid[reel][row]);
    if (cells[0].id === config.scatter) return;
    const base = cells.find((c) => c.id !== config.wild) ?? cells[0];
    if (base.id === config.scatter) return;
    let count = 0;
    for (const c of cells) {
      if (c.id === base.id || c.id === config.wild) count++;
      else break;
    }
    if (count < 3) return;
    const multiplier = base.pays[count - 3] ?? 0;
    if (multiplier > 0) {
      lineWins.push({ line: lineIndex, count, symbol: base, win: lineBet * multiplier });
    }
  });

  let scatterCount = 0;
  if (config.scatter) {
    for (const reel of grid) for (const c of reel) if (c.id === config.scatter) scatterCount++;
  }
  const scatterPays = [5, 20, 100];
  const scatterWin = scatterCount >= 3 ? bet * scatterPays[Math.min(scatterCount, 5) - 3] : 0;

  const jackpot =
    !!config.jackpotSymbol && grid.every((reel) => reel[1].id === config.jackpotSymbol);

  const win = Math.round(lineWins.reduce((sum, w) => sum + w.win, 0) + scatterWin);
  return {
    win,
    lineWins,
    scatterCount,
    freeSpins: scatterCount >= 3 ? FREE_SPINS_AWARD : 0,
    jackpot,
  };
}

// Класичний 3-барабанний набір символів.
export function classicSymbols(emojis: string[]): SlotSymbol[] {
  const weights = [30, 26, 22, 14, 9, 6, 4];
  const pays = [15, 20, 30, 45, 80, 150, 300];
  // ×0.94: RTP ≈ 0.90, виграш приблизно кожен 5-й оберт.
  return emojis.map((emoji, i) => ({ id: `c${i}`, emoji, weight: weights[i], pays: [Math.round(pays[i] * 0.94 * 10) / 10] }));
}

// 5-барабанний набір: 6 звичайних символів, wild і scatter.
export function videoSymbols(emojis: string[], wild: string, scatter: string, payScale = 0.71): SlotSymbol[] {
  const weights = [22, 20, 18, 12, 9, 6];
  const pays = [
    [6, 15, 45],
    [6, 18, 60],
    [9, 24, 75],
    [15, 45, 150],
    [24, 75, 270],
    [45, 150, 600],
  ];
  return [
    // ×0.71 і scatter вагою 4: бонус приблизно раз на 42 оберти, RTP ≈ 0.89 з фриспінами (і з колесом Карася).
    ...emojis.map((emoji, i) => ({ id: `v${i}`, emoji, weight: weights[i], pays: pays[i].map((p) => Math.round(p * payScale * 10) / 10) })),
    { id: 'wild', emoji: wild, weight: 3, pays: [60, 240, 900] },
    { id: 'scatter', emoji: scatter, weight: 4, pays: [] },
  ];
}
