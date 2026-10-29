// «Шахта»: пікселеві блоки з міцністю, руда цінніша на глибині, динаміт підриває сусідів.

export const MINE_COLS = 6;
export const MINE_ROWS = 14; // стільки рядів генеруємо наперед; далі шахта добудовується, поки кирка летить, дна немає
export const STRIKES = 30;
// RTP за симуляцією (жадібна стратегія): дерев'яна ≈ 0.65, кам'яна ≈ 0.66, залізна ≈ 0.78, алмазна ≈ 1.15.

export type BlockType = 'dirt' | 'stone' | 'coal' | 'iron' | 'gold' | 'diamond' | 'chest' | 'tnt';

export interface BlockInfo {
  name: string;
  hp: number;
  value: number; // × ставка
  color: string;
  dark: string;
  icon: string;
}

export const BLOCKS: Record<BlockType, BlockInfo> = {
  dirt: { name: 'Земля', hp: 4, value: 0, color: '#8B5A2B', dark: '#5E3A17', icon: '' },
  stone: { name: 'Камінь', hp: 8, value: 0, color: '#7C7C86', dark: '#55555E', icon: '' },
  coal: { name: 'Вугілля', hp: 8, value: 0.01, color: '#6B6B73', dark: '#2B2B30', icon: '⚫' },
  iron: { name: 'Залізо', hp: 12, value: 0.029, color: '#8A8A93', dark: '#C9A27E', icon: '🟤' },
  gold: { name: 'Золото', hp: 16, value: 0.096, color: '#8A8A93', dark: '#F5C518', icon: '🟡' },
  diamond: { name: 'Діамант', hp: 24, value: 0.384, color: '#8A8A93', dark: '#4FE3E3', icon: '💎' },
  chest: { name: 'Скриня', hp: 4, value: 0, color: '#A0522D', dark: '#FFD54A', icon: '🧰' },
  tnt: { name: 'Динаміт', hp: 4, value: 0, color: '#D62828', dark: '#FFFFFF', icon: '🧨' },
};

export const PICKAXES = [
  { name: "Дерев'яна кирка", power: 4, price: 0, emoji: '🪵' },
  { name: "Кам'яна кирка", power: 5, price: 15000, emoji: '🪨' },
  { name: 'Залізна кирка', power: 6, price: 60000, emoji: '⛏️' },
  { name: 'Алмазна кирка', power: 8, price: 300000, emoji: '💎' },
];

export const CHEST_PRIZES = [0.08, 0.16, 0.16, 0.32, 0.32, 0.48, 0.8, 1.6];

export interface Block {
  type: BlockType;
  hp: number;
  broken: boolean;
  prize: number; // для скрині
}

function weights(depth: number): [BlockType, number][] {
  // Глибше за MINE_ROWS руда вже не багатшає.
  const d = Math.min(1, depth / (MINE_ROWS - 1));
  return [
    ['dirt', 40 * (1 - d) + 2],
    ['stone', 30 + 20 * d],
    ['coal', 12],
    ['iron', 6 + 6 * d],
    ['gold', 2 + 5 * d],
    ['diamond', 0.3 + 2.5 * d],
    ['chest', 1.5],
    ['tnt', 1.5],
  ];
}

/** Додає один ряд блоків у кінець шахти. */
export function addRow(blocks: Block[], rand: () => number = Math.random) {
  const row = blocks.length / MINE_COLS;
  const w = weights(row);
  const total = w.reduce((s, [, x]) => s + x, 0);
  for (let col = 0; col < MINE_COLS; col++) {
    let r = rand() * total;
    let type: BlockType = 'stone';
    for (const [t, x] of w) {
      r -= x;
      if (r < 0) {
        type = t;
        break;
      }
    }
    const prize = type === 'chest' ? CHEST_PRIZES[Math.floor(rand() * CHEST_PRIZES.length)] : 0;
    blocks.push({ type, hp: BLOCKS[type].hp, broken: false, prize });
  }
}

export function generateMine(rand: () => number = Math.random): Block[] {
  const blocks: Block[] = [];
  for (let row = 0; row < MINE_ROWS; row++) addRow(blocks, rand);
  return blocks;
}

export function neighbors(i: number, diagonal = false, rows = MINE_ROWS): number[] {
  const row = Math.floor(i / MINE_COLS);
  const col = i % MINE_COLS;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      if (!diagonal && dr && dc) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < MINE_COLS) out.push(r * MINE_COLS + c);
    }
  return out;
}

export function reachable(blocks: Block[], i: number) {
  if (blocks[i].broken) return false;
  if (i < MINE_COLS) return true;
  return neighbors(i, false, blocks.length / MINE_COLS).some((n) => blocks[n].broken);
}

export function blockValue(b: Block) {
  return b.type === 'chest' ? b.prize : BLOCKS[b.type].value;
}

export interface StrikeResult {
  blocks: Block[];
  broken: number[]; // зламані цим ударом (з вибухом)
  value: number; // × ставка
  exploded: boolean;
}

export function strike(blocks: Block[], i: number, power: number): StrikeResult {
  const next = blocks.map((b) => ({ ...b }));
  const target = next[i];
  target.hp = Math.max(0, target.hp - power);
  const broken: number[] = [];
  let value = 0;
  let exploded = false;
  if (target.hp === 0) {
    target.broken = true;
    broken.push(i);
    value += blockValue(target);
    if (target.type === 'tnt') {
      exploded = true;
      for (const n of neighbors(i, true, next.length / MINE_COLS)) {
        const b = next[n];
        if (b.broken) continue;
        b.broken = true;
        b.hp = 0;
        broken.push(n);
        value += blockValue(b);
      }
    }
  }
  return { blocks: next, broken, value, exploded };
}

/** Куди б'є кирка сама: найвигідніший доступний блок за кількістю ударів (як у симуляції RTP). */
export function autoTarget(blocks: Block[], power: number, rand: () => number = Math.random): number {
  let best = -1;
  let score = -1;
  blocks.forEach((b, i) => {
    if (b.broken || !reachable(blocks, i)) return;
    const hits = Math.ceil(b.hp / power);
    const v = blockValue(b) + (b.type === 'tnt' ? 0.05 : 0) + (0.003 * Math.floor(i / MINE_COLS)) / hits;
    const s = v / hits + rand() * 0.001;
    if (s > score) {
      score = s;
      best = i;
    }
  });
  return best;
}

// ───────────── Фізичний заїзд: кирка падає, відскакує від блоків і ламає їх, поки в неї є HP ─────────────

export const PICK_TIERS = [
  { name: "Дерев'яна кирка", hp: 50, power: 4, weight: 55, color: '#B7834B' },
  { name: "Кам'яна кирка", hp: 65, power: 5, weight: 28, color: '#9CA3AF' },
  { name: 'Залізна кирка', hp: 85, power: 6, weight: 13, color: '#E5E7EB' },
  { name: 'Алмазна кирка', hp: 110, power: 8, weight: 4, color: '#4FE3E3' },
];

/** Скільки HP кирки забирає один удар по блоку. */
export const HIT_COST: Record<BlockType, number> = { dirt: 2, stone: 3, coal: 3, iron: 4, gold: 4, diamond: 5, chest: 1, tnt: 1 };
/** Множник цінності руди у фізичному заїзді (підібраний симуляцією). */
export let ORE_SCALE = 4.2; // RTP ≈ 0.89 з урахуванням шансів рулетки
export function setOreScale(k: number) {
  ORE_SCALE = k;
}

export function rollPick(rand: () => number = Math.random): number {
  const total = PICK_TIERS.reduce((s, p) => s + p.weight, 0);
  let r = rand() * total;
  for (let i = 0; i < PICK_TIERS.length; i++) {
    r -= PICK_TIERS[i].weight;
    if (r < 0) return i;
  }
  return 0;
}

export const PICK_R = 0.32;
export const FPS = 30;

export interface RunHit {
  frame: number;
  index: number;
  pickHp: number;
  broken: number[];
  value: number; // × ставка, уже з ORE_SCALE
  exploded: boolean;
}

export interface MineRun {
  frames: number[]; // x, y, кут (градуси) на кожен кадр
  hits: RunHit[];
  value: number;
  /** Шахта на початку заїзду разом з рядами, добудованими по дорозі. */
  start: Block[];
  depth: number; // найглибший ряд, до якого дістала кирка
}

/** Повністю прораховує заїзд наперед: інтерфейс лише програє кадри. */
export function simulateRun(initial: Block[], tier: number, rand: () => number = Math.random): MineRun {
  const pick = PICK_TIERS[tier];
  const start = initial.map((b) => ({ ...b }));
  const blocks = start.map((b) => ({ ...b }));
  let depth = 0;
  const G = 28;
  const SUB = 8;
  const dt = 1 / (FPS * SUB);
  const r = PICK_R;
  let x = 0.8 + rand() * (MINE_COLS - 1.6);
  let y = -1.2;
  let vx = (rand() - 0.5) * 3;
  let vy = 0;
  let angle = 0;
  let hp = pick.hp;
  let cooldown = 0;
  let value = 0;
  const frames: number[] = [];
  const hits: RunHit[] = [];
  for (let frame = 0; frame < FPS * 60; frame++) {
    for (let s = 0; s < SUB; s++) {
      vy += G * dt;
      x += vx * dt;
      y += vy * dt;
      angle += vx * 220 * dt + 160 * dt;
      cooldown -= dt;
      if (x < r) {
        x = r;
        vx = Math.abs(vx) * 0.6;
      } else if (x > MINE_COLS - r) {
        x = MINE_COLS - r;
        vx = -Math.abs(vx) * 0.6;
      }
      // Дна немає: перед киркою завжди є ще кілька рядів.
      while (blocks.length / MINE_COLS < Math.floor(y) + 4) {
        const from = blocks.length;
        addRow(start, rand);
        for (let k = from; k < start.length; k++) blocks.push({ ...start[k] });
      }
      const rows = blocks.length / MINE_COLS;
      depth = Math.max(depth, Math.floor(y));
      const c0 = Math.floor(x - r);
      const r0 = Math.floor(y - r);
      for (let row = r0; row <= r0 + 1; row++) {
        if (row < 0 || row >= rows) continue;
        for (let col = c0; col <= c0 + 1; col++) {
          if (col < 0 || col >= MINE_COLS) continue;
          const i = row * MINE_COLS + col;
          if (blocks[i].broken) continue;
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
          if (vn < 0) {
            vx -= 1.5 * vn * nx;
            vy -= 1.5 * vn * ny;
          }
          // Удар зверху: кирка б'є блок і підстрибує, тому ніколи не завмирає.
          if (ny < -0.5) {
            vy = -(3.5 + rand() * 2.5);
            vx = Math.max(-5, Math.min(5, vx + (rand() - 0.5) * 4));
          }
          if (cooldown <= 0 && (vn < -1 || ny < -0.5)) {
            cooldown = 0.12;
            const res = strike(blocks, i, pick.power);
            for (let k = 0; k < blocks.length; k++) blocks[k] = res.blocks[k];
            hp = Math.max(0, hp - HIT_COST[start[i].type]);
            const v = res.value * ORE_SCALE;
            value += v;
            hits.push({ frame, index: i, pickHp: hp, broken: res.broken, value: v, exploded: res.exploded });
          }
        }
      }
      if (hp <= 0) break;
    }
    frames.push(x, y, angle % 360);
    if (hp <= 0) break;
  }
  return { frames, hits, value, start, depth };
}
