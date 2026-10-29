// Власні піксельні текстури шахти: малюються кодом у маленькі канвас-плитки 16×16 один раз при старті.
import type { Cell } from './digEngine';

const N = 16;
type Canvas = HTMLCanvasElement;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tile(draw: (px: (x: number, y: number, c: string) => void, rand: () => number) => void, seed: number): Canvas {
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const ctx = cv.getContext('2d')!;
  const px = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };
  draw(px, seeded(seed));
  return cv;
}

const pick = <T,>(a: T[], r: () => number) => a[Math.floor(r() * a.length)];

function noise(px: (x: number, y: number, c: string) => void, rand: () => number, pal: string[]) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) px(x, y, pick(pal, rand));
}

const STONE = ['#7E7E86', '#8A8A92', '#73737B', '#6A6A72', '#7E7E86', '#94949C'];
const STONE_DARK = '#55555D';

function stone(px: (x: number, y: number, c: string) => void, rand: () => number) {
  noise(px, rand, STONE);
  // Кілька темних тріщинок, щоб камінь не був пласким.
  for (let k = 0; k < 5; k++) {
    let x = Math.floor(rand() * N);
    let y = Math.floor(rand() * N);
    for (let s = 0; s < 3; s++) {
      px(x, y, STONE_DARK);
      x = Math.min(N - 1, x + (rand() < 0.5 ? 1 : 0));
      y = Math.min(N - 1, y + 1);
    }
  }
}

function ore(colors: string[], spots: number) {
  return (px: (x: number, y: number, c: string) => void, rand: () => number) => {
    stone(px, rand);
    // Великі самоцвіти-грудки: світлий верх, темний низ, як у піксельних іграх.
    const shape = [
      [1, 0], [2, 0],
      [0, 1], [1, 1], [2, 1], [3, 1],
      [0, 2], [1, 2], [2, 2], [3, 2],
      [1, 3], [2, 3],
    ];
    const used: [number, number][] = [];
    for (let k = 0, tries = 0; k < spots && tries < 40; tries++) {
      const cx = 1 + Math.floor(rand() * (N - 5));
      const cy = 1 + Math.floor(rand() * (N - 5));
      if (used.some(([ux, uy]) => Math.abs(ux - cx) < 4 && Math.abs(uy - cy) < 4)) continue;
      used.push([cx, cy]);
      k++;
      for (const [dx, dy] of shape) px(cx + dx, cy + dy, dy === 0 || (dy === 1 && dx === 1) ? colors[2] : dy === 3 || dx === 3 ? colors[1] : colors[0]);
    }
  };
}

function dirt(px: (x: number, y: number, c: string) => void, rand: () => number) {
  noise(px, rand, ['#8B5A2B', '#7A4E25', '#96643A', '#6E4520', '#8B5A2B']);
}

function grass(px: (x: number, y: number, c: string) => void, rand: () => number) {
  dirt(px, rand);
  const g = ['#5DBB3F', '#4FA834', '#6FD14B'];
  for (let x = 0; x < N; x++) {
    const h = 3 + Math.floor(rand() * 3);
    for (let y = 0; y < h; y++) px(x, y, pick(g, rand));
  }
}

function crate(mark: (px: (x: number, y: number, c: string) => void) => void) {
  return (px: (x: number, y: number, c: string) => void, rand: () => number) => {
    noise(px, rand, ['#A86F35', '#9A632D', '#B57B3E']);
    for (let i = 0; i < N; i++) {
      px(i, 0, '#5E3A17');
      px(i, N - 1, '#5E3A17');
      px(0, i, '#5E3A17');
      px(N - 1, i, '#5E3A17');
      px(i, 5, '#7A4C22');
      px(i, 10, '#7A4C22');
    }
    mark(px);
  };
}

function arrow(px: (x: number, y: number, c: string) => void) {
  const g = '#3DDC4B';
  const d = '#1E8A28';
  for (let y = 3; y <= 12; y++) {
    const half = y < 8 ? y - 3 : 1;
    for (let x = 8 - half - 1; x <= 7 + half; x++) px(x, y, y < 8 && (x === 8 - half - 1 || x === 7 + half) ? d : g);
  }
}

function cross(px: (x: number, y: number, c: string) => void) {
  const r = '#E53935';
  const w = '#FFFFFF';
  for (let i = 4; i <= 11; i++)
    for (let j = 6; j <= 9; j++) {
      px(i, j, r);
      px(j, i, r);
    }
  px(7, 7, w);
  px(8, 8, w);
}

function tnt(px: (x: number, y: number, c: string) => void, rand: () => number) {
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const band = y >= 5 && y <= 10;
      px(x, y, band ? '#F2F2F2' : x % 3 === 0 ? '#B71C1C' : pick(['#E53935', '#D32F2F'], rand));
    }
  // Літери TNT у білій смузі.
  const T = [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2], [1, 3]];
  const Nn = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1], [2, 2], [3, 0], [3, 1], [3, 2], [3, 3]];
  for (const [x, y] of T) px(1 + x, 6 + y, '#222');
  for (const [x, y] of Nn) px(6 + x, 6 + y, '#222');
  for (const [x, y] of T) px(12 + x, 6 + y, '#222');
}

function slime(px: (x: number, y: number, c: string) => void, rand: () => number) {
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
      px(x, y, edge ? '#4E9A2E' : pick(['#8BE15E', '#7CD452', '#97EA6A'], rand));
    }
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) px(x, y, '#A8F27E');
  px(5, 6, '#1F3B12');
  px(6, 6, '#1F3B12');
  px(10, 6, '#1F3B12');
  px(9, 6, '#1F3B12');
  px(7, 9, '#1F3B12');
  px(8, 9, '#1F3B12');
}

function emerald(px: (x: number, y: number, c: string) => void, rand: () => number) {
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const b = Math.min(x, y, N - 1 - x, N - 1 - y);
      px(x, y, b === 0 ? '#0F6B2A' : b === 1 ? '#1FA544' : pick(['#2ECC55', '#36D95E', '#28BD4D'], rand));
    }
  for (let i = 3; i < 8; i++) px(i, 3, '#A6FFC0');
  px(3, 4, '#A6FFC0');
  px(3, 5, '#A6FFC0');
}

function bedrock(px: (x: number, y: number, c: string) => void, rand: () => number) {
  noise(px, rand, ['#2B2B2F', '#3A3A40', '#1C1C20', '#4A4A50', '#2B2B2F']);
}

function cave(px: (x: number, y: number, c: string) => void, rand: () => number) {
  noise(px, rand, ['#2A2A31', '#26262C', '#2F2F37', '#24242A']);
}

export type Tiles = Record<Cell | 'cave', Canvas[]>;

let cache: Tiles | null = null;

/** Кілька варіантів кожної плитки, щоб шахта не виглядала однаковою. */
export function tiles(): Tiles | null {
  if (cache) return cache;
  if (typeof document === 'undefined') return null;
  const v = (fn: (px: (x: number, y: number, c: string) => void, rand: () => number) => void, n: number, seed: number) =>
    Array.from({ length: n }, (_, k) => tile(fn, seed + k * 97));
  cache = {
    grass: v(grass, 3, 1),
    dirt: v(dirt, 3, 11),
    stone: v(stone, 4, 21),
    copper: v(ore(['#E7A57E', '#B9714A', '#F6CDB2'], 5), 3, 31),
    ruby: v(ore(['#E53950', '#9E1830', '#FF8095'], 5), 3, 41),
    gold: v(ore(['#F4D03F', '#B8901A', '#FFF2A6'], 5), 3, 51),
    emerald: v(emerald, 2, 61),
    diamond: v(ore(['#4FE3E3', '#1E9AA8', '#D2FFFF'], 5), 3, 71),
    tnt: v(tnt, 1, 81),
    slime: v(slime, 1, 91),
    upgrade: v(crate(arrow), 1, 101),
    repair: v(crate(cross), 1, 111),
    bedrock: v(bedrock, 3, 121),
    cave: v(cave, 3, 131),
  };
  return cache;
}

/** Тріщини поверх пошкодженого блоку (3 стадії). */
let cracks: Canvas[] | null = null;
export function crackTiles(): Canvas[] {
  if (cracks) return cracks;
  cracks = [1, 2, 3].map((stage) =>
    tile((px, rand) => {
      for (let k = 0; k < stage * 3; k++) {
        let x = 3 + Math.floor(rand() * 10);
        let y = 2 + Math.floor(rand() * 4);
        for (let s = 0; s < 4 + stage; s++) {
          px(x, y, 'rgba(20,20,24,0.85)');
          x = Math.max(0, Math.min(N - 1, x + Math.floor(rand() * 3) - 1));
          y = Math.min(N - 1, y + 1);
        }
      }
    }, 200 + stage),
  );
  return cracks;
}

/** Рамка порталу, з якого вилітає кирка. */
export function portalTile(): Canvas | null {
  if (typeof document === 'undefined') return null;
  const S = 24;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d')!;
  const rand = seeded(7);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const b = Math.min(x, y, S - 1 - x, S - 1 - y);
      if (b > 3) continue;
      ctx.fillStyle = y < 3 && rand() < 0.7 ? pick(['#5DBB3F', '#4FA834'], rand) : pick(STONE, rand);
      ctx.fillRect(x, y, 1, 1);
    }
  ctx.fillStyle = 'rgba(10,10,30,0.85)';
  ctx.fillRect(4, 4, S - 8, S - 8);
  ctx.fillStyle = '#F5C518';
  for (const [x, y] of [[1, 11], [1, 12], [S - 2, 11], [S - 2, 12]]) ctx.fillRect(x, y, 1, 1);
  return cv;
}
