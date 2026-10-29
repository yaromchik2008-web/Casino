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
  /** Скільки фриспінів дають 3+ scatter (типово FREE_SPINS_AWARD). */
  freeSpins?: number;
  /** Особливість фриспінів цього слота: у кожного своя. */
  feature?: FsFeature;
}

/**
 * Особливості фриспінів:
 * expand: wild розростається на весь барабан; sticky: wild залишаються до кінця бонусу;
 * ladder: кожен виграшний фриспін +1 до множника; randomWilds: 1–3 випадкові клітинки стають wild;
 * wildReel: інколи цілий барабан стає wild; randomMult: випадковий множник оберту;
 * double: усі виграші ×2; mystery: на весь бонус один звичайний символ стає wild;
 * thunder: блискавка перетворює 3–5 клітинок на один дорогий символ.
 */
export type FsFeature = 'expand' | 'sticky' | 'ladder' | 'randomWilds' | 'wildReel' | 'randomMult' | 'double' | 'mystery' | 'thunder';

export const FEATURE_INFO: Record<FsFeature, { title: string; text: string; emoji: string }> = {
  expand: { title: 'Розширні wild', text: 'кожен wild розростається на весь барабан', emoji: '↕️' },
  sticky: { title: 'Липкі wild', text: 'кожен wild залишається на місці до кінця бонусу', emoji: '📌' },
  ladder: { title: 'Множник, що росте', text: 'кожен виграшний фриспін додає +1 до множника', emoji: '📈' },
  randomWilds: { title: 'Скарби на мапі', text: 'на кожному фриспіні 1–2 клітинки стають wild', emoji: '✨' },
  wildReel: { title: 'Вогняний барабан', text: 'на фриспіні цілий барабан може стати wild', emoji: '🔥' },
  randomMult: { title: 'Чарівний множник', text: 'кожен фриспін отримує множник ×1…×5', emoji: '🪄' },
  double: { title: 'Подвійна порція', text: 'усі виграші у фриспінах ×2', emoji: '✖️' },
  mystery: { title: 'Таємний символ', text: 'на весь бонус один символ стає wild', emoji: '❓' },
  thunder: { title: 'Молот Тора', text: 'блискавка перетворює 3–5 клітинок на один дорогий символ', emoji: '⚡' },
};

/** Стан бонусу між фриспінами. */
export interface FsState {
  sticky: boolean[][];
  ladder: number;
  mystery?: string;
}

export function newFsState(config: SlotConfig, rand: () => number = Math.random): FsState {
  const plain = config.symbols.filter((x) => x.id !== config.wild && x.id !== config.scatter);
  return {
    sticky: Array.from({ length: config.reels }, () => Array(ROWS).fill(false)),
    ladder: 1,
    // Таємний символ береться з трьох найрідкісніших, інакше бонус занадто щедрий.
    mystery: config.feature === 'mystery' ? plain.slice(-3)[Math.floor(rand() * 3)].id : undefined,
  };
}

export interface FsSpin {
  grid: Grid;
  /** Клітинки, які змінила особливість (для підсвітки). */
  changed: boolean[][];
  /** Множник виграшу оберту. */
  mult: number;
}

/** Фриспін з особливістю слота. Після оцінки виграшу викликати finishFeature. */
export function featureSpin(config: SlotConfig, st: FsState, rand: () => number = Math.random): FsSpin {
  const grid = spinGrid(config, rand, true);
  const changed = Array.from({ length: config.reels }, () => Array(ROWS).fill(false));
  const wild = config.symbols.find((x) => x.id === config.wild);
  let mult = 1;
  const setWild = (r: number, row: number) => {
    if (!wild || grid[r][row].id === config.scatter || grid[r][row].id === wild.id) return;
    grid[r][row] = wild;
    changed[r][row] = true;
  };
  switch (config.feature) {
    case 'expand':
      for (let r = 0; r < config.reels; r++) if (grid[r].some((x) => x.id === config.wild)) for (let row = 0; row < ROWS; row++) setWild(r, row);
      break;
    case 'sticky':
      for (let r = 0; r < config.reels; r++) for (let row = 0; row < ROWS; row++) if (st.sticky[r][row]) setWild(r, row);
      break;
    case 'randomWilds': {
      const n = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) setWild(Math.floor(rand() * config.reels), Math.floor(rand() * ROWS));
      break;
    }
    case 'wildReel':
      if (rand() < 0.4) {
        const r = 1 + Math.floor(rand() * (config.reels - 2));
        for (let row = 0; row < ROWS; row++) setWild(r, row);
      }
      break;
    case 'randomMult': {
      const vals = [1, 1, 2, 2, 3, 5];
      mult = vals[Math.floor(rand() * vals.length)];
      break;
    }
    case 'double':
      mult = 2;
      break;
    case 'ladder':
      mult = st.ladder;
      break;
    case 'thunder': {
      const plain = config.symbols.filter((x) => x.id !== config.wild && x.id !== config.scatter);
      const top = plain.slice(-3);
      const sym = top[Math.floor(rand() * top.length)];
      const n = 3 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const r = Math.floor(rand() * config.reels);
        const row = Math.floor(rand() * ROWS);
        if (grid[r][row].id === config.scatter || grid[r][row].id === config.wild) continue;
        grid[r][row] = sym;
        changed[r][row] = true;
      }
      break;
    }
    case 'mystery':
      for (let r = 0; r < config.reels; r++) for (let row = 0; row < ROWS; row++) if (grid[r][row].id === st.mystery) setWild(r, row);
      break;
  }
  return { grid, changed, mult };
}

/** Оновлює стан бонусу після оберту: липкі wild запам'ятовуються, драбина росте після виграшу. */
export function finishFeature(config: SlotConfig, st: FsState, spin: FsSpin, won: boolean) {
  if (config.feature === 'sticky')
    spin.grid.forEach((col, r) => col.forEach((x, row) => x.id === config.wild && (st.sticky[r][row] = true)));
  if (config.feature === 'ladder' && won) st.ladder = Math.min(10, st.ladder + 1);
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
// У фриспінах scatter випадає на чверть рідше, тож повторний бонус (ретригер) трапляється рідше, ніж у звичайній грі.
export const FREE_SCATTER_SCALE = 0.75;

export function paylines(config: SlotConfig): number[][] {
  return config.reels === 3 ? LINES_3 : LINES_5;
}

export type Grid = SlotSymbol[][]; // grid[reel][row]

export function randomSymbol(config: SlotConfig, rand: () => number = Math.random, free = false): SlotSymbol {
  const weight = (s: SlotSymbol) => (free && s.id === config.scatter ? s.weight * FREE_SCATTER_SCALE : s.weight);
  const total = config.symbols.reduce((sum, s) => sum + weight(s), 0);
  let roll = rand() * total;
  for (const s of config.symbols) {
    roll -= weight(s);
    if (roll < 0) return s;
  }
  return config.symbols[0];
}

export function spinGrid(config: SlotConfig, rand: () => number = Math.random, free = false): Grid {
  return Array.from({ length: config.reels }, () =>
    Array.from({ length: ROWS }, () => randomSymbol(config, rand, free)),
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
    freeSpins: scatterCount >= 3 ? config.freeSpins ?? FREE_SPINS_AWARD : 0,
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
