// «Потужноліт»: літак злітає з авіаносця, сам летить над морем і збирає бонуси.
// +1…+4 додаються до множника, ×2…×4 множать його, ракета ділить навпіл (максимум ×50).
// Посадка на корабель платить ставку × множник, падіння в море забирає ставку.

export type PlaneMode = 'normal' | 'fast';
export type PickKind = 'add' | 'mul' | 'rocket';

export interface Pick {
  kind: PickKind;
  v: number; // +v, ×v; для ракети 2 (ділить)
  x: number; // світові координати: x у пікселях шляху, y від 0 (море) до 1 (стеля)
  y: number;
  hit: boolean; // false: просто пролітає повз
  after: number; // множник після підбору (для hit)
}

export interface Flight {
  mode: PlaneMode;
  picks: Pick[];
  landed: boolean;
  mult: number;
  /** Точки шляху: зліт, підбори, фініш. */
  path: { x: number; y: number }[];
  endX: number;
  /** Де стоїть корабель посадки: при падінні літак не долітає до нього. */
  shipX: number;
}

export const MAX_MULT = 50;
export const SPEED: Record<PlaneMode, number> = { normal: 190, fast: 330 };
const HITS: Record<PlaneMode, [number, number]> = { normal: [2, 5], fast: [1, 3] };
// Ймовірність посадки підібрана симуляцією під RTP ≈ 0.9 (див. simPlane).
export const LAND_P: Record<PlaneMode, number> = { normal: 0.295, fast: 0.394 };

const TABLE: { kind: PickKind; v: number; w: number }[] = [
  { kind: 'add', v: 1, w: 26 },
  { kind: 'add', v: 2, w: 12 },
  { kind: 'add', v: 3, w: 4 },
  { kind: 'add', v: 4, w: 2 },
  { kind: 'mul', v: 2, w: 4 },
  { kind: 'mul', v: 3, w: 1.2 },
  { kind: 'mul', v: 4, w: 0.4 },
  { kind: 'rocket', v: 2, w: 36 },
];
const TOTAL_W = TABLE.reduce((s, r) => s + r.w, 0);

function roll(rnd: () => number) {
  let r = rnd() * TOTAL_W;
  for (const t of TABLE) {
    r -= t.w;
    if (r < 0) return t;
  }
  return TABLE[0];
}

export function apply(m: number, kind: PickKind, v: number) {
  const n = kind === 'add' ? m + v : kind === 'mul' ? m * v : m / v;
  return Math.max(0.1, Math.min(MAX_MULT, Math.round(n * 100) / 100));
}

export function fly(mode: PlaneMode, rnd: () => number = Math.random): Flight {
  const [lo, hi] = HITS[mode];
  const n = lo + Math.floor(rnd() * (hi - lo + 1));
  const path = [
    { x: 0, y: 0.1 },
    { x: 150, y: 0.14 },
  ];
  const picks: Pick[] = [];
  let m = 1;
  let x = 150;
  for (let i = 0; i < n; i++) {
    const dx = 240 + rnd() * 150;
    x += dx;
    const y = 0.3 + rnd() * 0.55;
    const t = roll(rnd);
    m = apply(m, t.kind, t.v);
    picks.push({ kind: t.kind, v: t.v, x, y, hit: true, after: m });
    path.push({ x, y });
    // Бонуси повз які літак пролітає: щоб небо не було порожнім.
    const decoys = rnd() < 0.7 ? 1 + Math.floor(rnd() * 2) : 0;
    for (let k = 0; k < decoys; k++) {
      const d = roll(rnd);
      const dy = (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.2);
      const yy = Math.max(0.22, Math.min(0.95, y + dy));
      if (Math.abs(yy - y) < 0.2) continue;
      picks.push({ kind: d.kind, v: d.v, x: x - dx * (0.3 + rnd() * 0.4), y: yy, hit: false, after: 0 });
    }
  }
  const landed = rnd() < LAND_P[mode];
  const endX = x + 420;
  if (landed) {
    path.push({ x: endX - 150, y: 0.2 });
    path.push({ x: endX, y: 0.1 });
  } else {
    path.push({ x: endX - 220, y: Math.max(0.3, path[path.length - 1].y) });
    path.push({ x: endX, y: -0.06 });
  }
  return { mode, picks, landed, mult: m, path, endX, shipX: landed ? endX : endX + 300 };
}

/** Висота шляху в точці x: плавна (косинусна) інтерполяція між точками. */
export function pathY(f: Flight, x: number) {
  const p = f.path;
  if (x <= p[0].x) return p[0].y;
  for (let i = 1; i < p.length; i++) {
    if (x <= p[i].x) {
      const a = p[i - 1];
      const b = p[i];
      const t = (x - a.x) / (b.x - a.x);
      const k = (1 - Math.cos(Math.PI * t)) / 2;
      return a.y + (b.y - a.y) * k;
    }
  }
  return p[p.length - 1].y;
}
