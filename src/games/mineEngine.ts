// «Шахта»: пікселеві блоки з міцністю, руда цінніша на глибині, динаміт підриває сусідів.

export const MINE_COLS = 6;
export const MINE_ROWS = 14;
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
  const d = depth / (MINE_ROWS - 1);
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

export function generateMine(rand: () => number = Math.random): Block[] {
  const blocks: Block[] = [];
  for (let row = 0; row < MINE_ROWS; row++) {
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
  return blocks;
}

export function neighbors(i: number, diagonal = false): number[] {
  const row = Math.floor(i / MINE_COLS);
  const col = i % MINE_COLS;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      if (!diagonal && dr && dc) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < MINE_ROWS && c >= 0 && c < MINE_COLS) out.push(r * MINE_COLS + c);
    }
  return out;
}

export function reachable(blocks: Block[], i: number) {
  if (blocks[i].broken) return false;
  if (i < MINE_COLS) return true;
  return neighbors(i).some((n) => blocks[n].broken);
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
      for (const n of neighbors(i, true)) {
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
