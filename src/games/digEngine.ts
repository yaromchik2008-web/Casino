// «Шахта» без дна: кирка падає, відскакує й ламає блоки, поки має HP.
// Удар по руді розбиває всю жилу, динаміт вибухає після ґнота, слиз підкидає, ящики покращують і лагодять кирку.
// Заїзд повністю прораховується наперед; інтерфейс лише програє кадри й події.

export const COLS = 8;
export const FPS = 30;
const CHUNK = 16;

export type Cell =
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'copper'
  | 'ruby'
  | 'gold'
  | 'emerald'
  | 'diamond'
  | 'tnt'
  | 'slime'
  | 'upgrade'
  | 'repair'
  | 'bedrock';

export type Ore = 'copper' | 'ruby' | 'gold' | 'emerald' | 'diamond';

/** Скільки × ставка дає один блок руди. */
export const ORE_VALUE: Record<Ore, number> = { copper: 0.015, ruby: 0.05, gold: 0.12, emerald: 0.3, diamond: 0.8 };
export const ORE_NAME: Record<Ore, string> = { copper: 'Мідь', ruby: 'Рубін', gold: 'Золото', emerald: 'Смарагд', diamond: 'Алмаз' };
export const isOre = (c: Cell): c is Ore => c in ORE_VALUE;

/** Міцність блоку. Руду треба вибити кількома ударами (цінніша міцніша), тоді ламається вся жила. */
const CELL_HP: Record<Cell, number> = {
  grass: 3,
  dirt: 3,
  stone: 5,
  copper: 5,
  ruby: 7,
  gold: 9,
  emerald: 12,
  diamond: 15,
  tnt: 1,
  slime: 1,
  upgrade: 1,
  repair: 1,
  bedrock: 20,
};
export const cellHp = (c: Cell) => CELL_HP[c];

/** Скільки HP кирки забирає один удар. */
const HIT_COST: Record<Cell, number> = {
  grass: 3,
  dirt: 3,
  stone: 4,
  copper: 4,
  ruby: 4,
  gold: 4,
  emerald: 4,
  diamond: 4,
  tnt: 2,
  slime: 0,
  upgrade: 0,
  repair: 0,
  bedrock: 5,
};

export const PICKS = [
  { name: "Дерев'яна кирка", hp: 100, power: 1, weight: 63.5, color: '#B7834B' },
  { name: "Кам'яна кирка", hp: 150, power: 1.25, weight: 25, color: '#9CA3AF' },
  { name: 'Залізна кирка', hp: 200, power: 1.5, weight: 8.8, color: '#E5E7EB' },
  { name: 'Алмазна кирка', hp: 400, power: 2, weight: 2.7, color: '#4FE3E3' },
];
const DAMAGE = 2.5; // × сила кирки за удар
// Після відскоку від слизу кілька ударів б'ють сильно і кирка пролітає крізь зламані блоки.
const SMASH_HITS = 4;
const SMASH_MULT = 4;

/** Множник руди, підібраний симуляцією під RTP ≈ 0.89. */
export let VALUE_SCALE = 1.2; // бічні удари й міцний чорний блок забирають більше HP кирки
export function setValueScale(k: number) {
  VALUE_SCALE = k;
}

export function rollPick(rand: () => number = Math.random): number {
  const total = PICKS.reduce((s, p) => s + p.weight, 0);
  let r = rand() * total;
  for (let i = 0; i < PICKS.length; i++) {
    r -= PICKS[i].weight;
    if (r < 0) return i;
  }
  return 0;
}

export interface Mine {
  cells: Cell[];
  hp: number[];
}
export const rowsOf = (m: { cells: Cell[] }) => m.cells.length / COLS;

function oreFor(row: number, rand: () => number): Ore {
  const d = Math.min(1, row / 160);
  const w: [Ore, number][] = [
    ['copper', 10 * (1 - 0.5 * d)],
    ['ruby', 6],
    ['gold', 3 + 3 * d],
    ['emerald', 1 + 2 * d],
    ['diamond', 0.35 + 1.4 * d],
  ];
  let r = rand() * w.reduce((s, [, x]) => s + x, 0);
  for (const [o, x] of w) {
    r -= x;
    if (r < 0) return o;
  }
  return 'copper';
}
const VEIN: Record<Ore, [number, number]> = { copper: [3, 9], ruby: [2, 7], gold: [2, 6], emerald: [2, 5], diamond: [1, 4] };

/** Тюнінг генерації (симуляція підбирає щільність руди). */
export const GEN = { veins: 0.068, tnt: 0.012, slime: 0.007, upgrade: 0.0035, repair: 0.008, bedrock: 0.012 };

/** Добудовує шахту ще на CHUNK рядів. */
export function grow(m: Mine, rand: () => number = Math.random) {
  const r0 = rowsOf(m);
  for (let row = r0; row < r0 + CHUNK; row++)
    for (let col = 0; col < COLS; col++) {
      let c: Cell = 'stone';
      if (row === 0) c = 'grass';
      else if (row < 4) c = rand() < 0.85 - row * 0.15 ? 'dirt' : 'stone';
      else {
        const x = rand();
        let acc = GEN.tnt;
        if (x < acc) c = 'tnt';
        else if (x < (acc += GEN.slime)) c = 'slime';
        else if (x < (acc += GEN.upgrade)) c = row > 6 ? 'upgrade' : 'stone';
        else if (x < (acc += GEN.repair)) c = 'repair';
        else if (x < (acc += row > 10 ? GEN.bedrock : 0)) c = 'bedrock';
      }
      m.cells.push(c);
      m.hp.push(CELL_HP[c]);
    }
  // Жили руди: випадкове блукання по каменю.
  const seeds = Math.round(CHUNK * COLS * GEN.veins * (0.7 + rand() * 0.6));
  for (let s = 0; s < seeds; s++) {
    let row = r0 + Math.floor(rand() * CHUNK);
    if (row < 2) continue;
    let col = Math.floor(rand() * COLS);
    const ore = oreFor(row, rand);
    const [lo, hi] = VEIN[ore];
    const size = lo + Math.floor(rand() * (hi - lo + 1));
    for (let k = 0, tries = 0; k < size && tries < size * 4; tries++) {
      const i = row * COLS + col;
      if (m.cells[i] === 'stone' || m.cells[i] === 'dirt') {
        m.cells[i] = ore;
        m.hp[i] = CELL_HP[ore];
        k++;
      }
      const dir = Math.floor(rand() * 4);
      if (dir === 0) col = Math.min(COLS - 1, col + 1);
      else if (dir === 1) col = Math.max(0, col - 1);
      else if (dir === 2) row = Math.min(r0 + CHUNK - 1, row + 1);
      else row = Math.max(Math.max(2, r0), row - 1);
    }
  }
}

export function newMine(rand: () => number = Math.random): Mine {
  const m: Mine = { cells: [], hp: [] };
  grow(m, rand);
  grow(m, rand);
  return m;
}

export type EventKind = 'hit' | 'break' | 'vein' | 'fuse' | 'boom' | 'slime' | 'upgrade' | 'repair' | 'bedrock';

export interface DigEvent {
  frame: number;
  kind: EventKind;
  cell: number;
  /** Зламані блоки (для вибуху й жили — усі). */
  broken: number[];
  /** Блоки, що дали виплату, і скільки кожен (× ставка). */
  paid: [number, number][];
  /** Нова міцність блоку після удару без ламання. */
  hp?: number;
  value: number; // × ставка за подію
  pickHp: number;
  tier: number;
}

export interface DigRun {
  start: Mine; // шахта до заїзду разом з усім, що добудувалось
  frames: Float32Array; // x, y, кут на кожен кадр
  events: DigEvent[];
  value: number;
  depth: number;
  tier: number; // з якою киркою почали
  hold: number; // скільки кадрів кирка висить у порталі
}

export const PICK_R = 0.42;
export const SKY_ROWS = 4;
const MAX_FRAMES = FPS * 150;

export function simulate(tier0: number, rand: () => number = Math.random): DigRun {
  const start = newMine(rand);
  const cells = [...start.cells];
  const hp = [...start.hp];
  const broken: boolean[] = cells.map(() => false);
  const fuses: { i: number; at: number }[] = [];
  const ensure = (row: number) => {
    while (rowsOf(start) < row + 6) {
      const from = start.cells.length;
      grow(start, rand);
      for (let k = from; k < start.cells.length; k++) {
        cells.push(start.cells[k]);
        hp.push(start.hp[k]);
        broken.push(false);
      }
    }
  };
  let tier = tier0;
  let maxHp = PICKS[tier].hp;
  let pickHp = maxHp;
  const G = 26;
  const SUB = 8;
  const dt = 1 / (FPS * SUB);
  const r = PICK_R;
  let x = COLS / 2 + (rand() - 0.5) * 2;
  let y = -2.2;
  let vx = (rand() - 0.5) * 2;
  let vy = 0;
  let angle = 0;
  let cooldown = 0;
  let smash = 0;
  let value = 0;
  let depth = 0;
  let time = 0;
  const hold = Math.round(FPS * 0.8);
  const frames: number[] = [];
  for (let f = 0; f < hold; f++) frames.push(x, y, 0);
  const events: DigEvent[] = [];
  let frame = hold;

  const pay = (i: number, out: [number, number][]) => {
    const c = cells[i];
    if (!isOre(c)) return 0;
    const v = ORE_VALUE[c] * VALUE_SCALE;
    out.push([i, v]);
    return v;
  };
  const neighbors4 = (i: number) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const out: number[] = [];
    if (col > 0) out.push(i - 1);
    if (col < COLS - 1) out.push(i + 1);
    if (row > 0) out.push(i - COLS);
    if (row < rowsOf(start) - 1) out.push(i + COLS);
    return out;
  };
  const explode = (i: number) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    // Сам динаміт теж зникає (його вже позначено зламаним, тож у циклі нижче він пропускається).
    const hit: number[] = [i];
    const paid: [number, number][] = [];
    let v = 0;
    ensure(row + 3);
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        if (Math.abs(dr) + Math.abs(dc) > 3) continue;
        const rr = row + dr;
        const cc = col + dc;
        if (rr < 0 || cc < 0 || cc >= COLS) continue;
        const j = rr * COLS + cc;
        if (broken[j]) continue;
        if (cells[j] === 'tnt' && j !== i) {
          if (!fuses.some((q) => q.i === j)) fuses.push({ i: j, at: time + 0.25 });
          continue;
        }
        broken[j] = true;
        hit.push(j);
        v += pay(j, paid);
      }
    // Вибух відкидає кирку.
    const dx = x - (col + 0.5);
    const dy = y - (row + 0.5);
    const d = Math.hypot(dx, dy);
    if (d < 3) {
      vx += (dx / (d || 1)) * 4;
      vy += Math.min(-4, (dy / (d || 1)) * 6);
    }
    value += v;
    events.push({ frame, kind: 'boom', cell: i, broken: hit, paid, value: v, pickHp, tier });
  };

  const strike = (i: number) => {
    const c = cells[i];
    const base = { frame, cell: i, broken: [] as number[], paid: [] as [number, number][], value: 0, tier };
    if (c === 'slime') {
      broken[i] = true;
      vy = -15;
      vx += (rand() - 0.5) * 4;
      smash = SMASH_HITS;
      events.push({ ...base, kind: 'slime', broken: [i], pickHp });
      return;
    }
    if (c === 'upgrade') {
      broken[i] = true;
      tier = Math.min(PICKS.length - 1, tier + 1);
      maxHp = PICKS[tier].hp;
      pickHp = maxHp;
      events.push({ ...base, kind: 'upgrade', broken: [i], pickHp, tier });
      return;
    }
    if (c === 'repair') {
      broken[i] = true;
      pickHp = Math.min(maxHp, pickHp + Math.round(maxHp * 0.4));
      events.push({ ...base, kind: 'repair', broken: [i], pickHp });
      return;
    }
    pickHp = Math.max(0, pickHp - HIT_COST[c]);
    // Після слизу кирка летить униз з розгону і б'є в рази сильніше.
    const power = DAMAGE * PICKS[tier].power * (smash > 0 ? SMASH_MULT : 1);
    if (smash > 0) smash--;
    if (c === 'tnt') {
      if (!fuses.some((q) => q.i === i)) fuses.push({ i, at: time + 0.6 });
      events.push({ ...base, kind: 'fuse', pickHp });
      return;
    }
    if (isOre(c)) {
      hp[i] = Math.max(0, hp[i] - power);
      if (hp[i] > 0) {
        events.push({ ...base, kind: 'hit', hp: hp[i], pickHp });
        return;
      }
      // Вибита руда: уся жила одного типу ламається разом.
      const vein: number[] = [];
      const stack = [i];
      broken[i] = true;
      while (stack.length && vein.length < 48) {
        const j = stack.pop()!;
        vein.push(j);
        for (const n of neighbors4(j))
          if (!broken[n] && cells[n] === c) {
            broken[n] = true;
            stack.push(n);
          }
      }
      const paid: [number, number][] = [];
      let v = 0;
      for (const j of vein) v += pay(j, paid);
      value += v;
      events.push({ ...base, kind: 'vein', broken: vein, paid, value: v, pickHp });
      return;
    }
    hp[i] = Math.max(0, hp[i] - power);
    if (hp[i] <= 0) {
      broken[i] = true;
      events.push({ ...base, kind: 'break', broken: [i], pickHp });
    } else events.push({ ...base, kind: 'hit', hp: hp[i], pickHp });
  };

  for (; frame < MAX_FRAMES; frame++) {
    for (let s = 0; s < SUB; s++) {
      time += dt;
      vy += G * dt;
      vx *= 0.9995;
      x += vx * dt;
      y += vy * dt;
      angle += vx * 200 * dt + 150 * dt;
      cooldown -= dt;
      if (x < r) {
        x = r;
        vx = Math.abs(vx) * 0.6;
      } else if (x > COLS - r) {
        x = COLS - r;
        vx = -Math.abs(vx) * 0.6;
      }
      ensure(Math.floor(y) + 2);
      depth = Math.max(depth, Math.floor(y));
      for (let q = fuses.length - 1; q >= 0; q--)
        if (time >= fuses[q].at) {
          const { i } = fuses[q];
          fuses.splice(q, 1);
          if (!broken[i]) {
            broken[i] = true;
            explode(i);
          }
        }
      const c0 = Math.floor(x - r);
      const r0 = Math.floor(y - r);
      for (let row = r0; row <= r0 + 1; row++) {
        if (row < 0) continue;
        for (let col = c0; col <= c0 + 1; col++) {
          if (col < 0 || col >= COLS) continue;
          const i = row * COLS + col;
          if (broken[i]) continue;
          const nx0 = Math.min(Math.max(x, col), col + 1);
          const ny0 = Math.min(Math.max(y, row), row + 1);
          let dx = x - nx0;
          let dy = y - ny0;
          let d = Math.hypot(dx, dy);
          if (d >= r) continue;
          if (d < 1e-6) {
            dx = 0;
            dy = -1;
            d = 1;
          }
          const nx = dx / d;
          const ny = dy / d;
          x = nx0 + nx * r;
          y = ny0 + ny * r;
          const vn = vx * nx + vy * ny;
          const before = [vx, vy];
          if (vn < 0) {
            vx -= 1.5 * vn * nx;
            vy -= 1.5 * vn * ny;
          }
          if (ny < -0.5) {
            vy = Math.min(vy, -(3 + rand() * 2.5));
            vx = Math.max(-4, Math.min(4, vx + (rand() - 0.5) * 3.5));
          }
          // Бічний дотик теж б'є блок, навіть коли кирка лише ковзає вздовж нього.
          const side = Math.abs(nx) > 0.6;
          if (cooldown <= 0 && (vn < -0.3 || ny < -0.5 || side)) {
            cooldown = 0.13;
            const smashing = smash > 0 && ny < -0.5;
            strike(i);
            if (smashing && broken[i]) {
              // Проламала блок з розгону: летить далі вниз, не відскакуючи.
              vx = before[0];
              vy = Math.max(before[1], 8);
            }
          }
        }
      }
      if (pickHp <= 0) break;
    }
    frames.push(x, y, angle % 360);
    if (pickHp <= 0) break;
  }
  // Ґноти, що ще горять, вибухають уже без кирки — гравцю це теж зараховується.
  for (const q of fuses.sort((a, b) => a.at - b.at)) {
    if (broken[q.i]) continue;
    broken[q.i] = true;
    explode(q.i);
  }
  return { start, frames: Float32Array.from(frames), events, value, depth: Math.max(0, depth), tier: tier0, hold };
}
