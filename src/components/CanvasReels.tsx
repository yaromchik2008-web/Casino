import { createElement, useEffect, useRef } from 'react';
import { getSettings } from '../audio/sound';
import type { Grid, SlotSymbol } from '../games/slotEngine';

// Барабани слота на одному канвасі (веб і Telegram): обертання, пружина при зупинці, підсвітка й лінії виграшу
// малюються без React-рендерів, тож нічого не смикається.

export interface WinLine {
  rows: number[]; // ряд на кожному барабані
  count: number; // скільки барабанів у виграші
}

interface Props {
  grid: Grid;
  spinning: boolean[];
  highlight: boolean[][];
  lines: WinLine[];
  tease: boolean[]; // барабани, що крутяться довше в очікуванні бонуски
  size: number;
  gap: number;
  art?: Record<string, unknown>;
  randomSymbol: () => SlotSymbol;
  speed: number; // мс на один прохід стрічки
  artCell: boolean;
}

const STRIP = 8;

type Img = HTMLImageElement;
const imgCache = new Map<unknown, Img>();
function imageOf(src: unknown): Img | null {
  if (typeof document === 'undefined') return null;
  let im = imgCache.get(src);
  if (!im) {
    im = document.createElement('img');
    const o = src as string | { uri?: string; default?: string };
    im.src = typeof o === 'string' ? o : (o?.uri ?? o?.default ?? '');
    imgCache.set(src, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}

// Емодзі малюються повільно, тож кожен символ рендеримо один раз у маленький канвас.
const emojiCache = new Map<string, HTMLCanvasElement>();
function emojiOf(e: string, px: number) {
  const key = `${e}:${px}`;
  let cv = emojiCache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    const s = Math.ceil(px * 1.4);
    cv.width = s;
    cv.height = s;
    const c = cv.getContext('2d')!;
    c.font = `${px}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(e, s / 2, s / 2 + px * 0.06);
    emojiCache.set(key, cv);
  }
  return cv;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function CanvasReels(props: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const p = useRef(props);
  p.current = props;
  const st = useRef({
    raf: 0,
    alive: true,
    reels: [] as { spin: boolean; offset: number; strip: SlotSymbol[]; stopAt: number }[],
    lineAt: 0,
    kick: () => {},
  });

  const reels = props.grid.length;
  const rows = props.grid[0]?.length ?? 3;
  const W = reels * props.size + (reels - 1) * props.gap;
  const H = rows * props.size + (rows - 1) * props.gap;

  // Перехід «крутиться → зупинився» запускає пружину; новий оберт — нову стрічку.
  const s = st.current;
  for (let i = 0; i < reels; i++) {
    const r = s.reels[i] ?? (s.reels[i] = { spin: false, offset: 0, strip: [], stopAt: -1e9 });
    const want = props.spinning[i];
    if (want && !r.spin) {
      r.spin = true;
      r.strip = Array.from({ length: STRIP }, () => props.randomSymbol());
    } else if (!want && r.spin) {
      r.spin = false;
      r.stopAt = performance.now();
    }
  }

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    // Повна щільність екрана (на айфоні 3×), інакше картинки символів виходять розмитими.
    const dpr = Math.min(3, (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio ?? 1);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    let last = -1;
    let running = false;
    let waiting = false;

    const drawSym = (sym: SlotSymbol, x: number, y: number, cell: number, alpha: number) => {
      const q = p.current;
      const src = q.art?.[sym.id];
      ctx.globalAlpha = alpha;
      if (src) {
        const im = imageOf(src);
        if (im) ctx.drawImage(im, x + 3, y + 3, cell - 6, cell - 6);
        else waiting = true; // картинка ще вантажиться: перемалюємо, коли буде
      } else {
        const e = emojiOf(sym.emoji, Math.round(q.size * 0.55 * dpr));
        const d = cell * 0.78;
        ctx.drawImage(e, x + (cell - d) / 2, y + (cell - d) / 2, d, d);
      }
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      const q = p.current;
      const dt = last < 0 ? 0 : Math.min(50, now - last);
      last = now;
      const { size, gap } = q;
      const step = size + gap;
      const lite = getSettings().lite;
      ctx.clearRect(0, 0, W, H);
      waiting = false;
      let busy = false;
      for (let i = 0; i < q.grid.length; i++) {
        const r = s.reels[i];
        const x = i * step;
        if (q.tease[i] && r.spin) {
          // Очікування бонуски: барабан світиться, поки крутиться.
          ctx.fillStyle = `rgba(255,213,74,${0.25 + 0.2 * Math.sin(now / 90)})`;
          roundRect(ctx, x - 2, 0, size + 4, H, 14);
          ctx.fill();
        }
        if (r.spin) {
          busy = true;
          r.offset = (r.offset + (dt / q.speed) * STRIP * step) % (STRIP * step);
          for (let k = -1; k < rows + 1; k++) {
            const pos = k * step + (r.offset % step);
            const idx = (((Math.floor(r.offset / step) - k) % STRIP) + STRIP) % STRIP;
            const y = pos;
            ctx.fillStyle = q.artCell ? '#FFF6E0' : '#FFFDF5';
            ctx.globalAlpha = 0.9;
            roundRect(ctx, x, y, size, size, 12);
            ctx.fill();
            ctx.globalAlpha = 1;
            drawSym(r.strip[idx], x, y, size, 0.7);
          }
          continue;
        }
        const t = now - r.stopAt;
        // Пружина при зупинці: заходить трохи нижче й повертається.
        const bounce = t < 600 ? -size * 0.3 * Math.exp(-t / 110) * Math.cos(t / 55) : 0;
        if (t < 600) busy = true;
        for (let row = 0; row < rows; row++) {
          const win = !!q.highlight[i]?.[row];
          const pulse = win && !lite ? 1 + 0.06 * (0.5 + 0.5 * Math.sin(now / 110)) : 1;
          if (win) busy = true;
          const cell = size * pulse;
          const cx = x + (size - cell) / 2;
          const cy = row * step + bounce + (size - cell) / 2;
          ctx.fillStyle = win ? '#FFF3C4' : q.artCell ? '#FFF6E0' : '#FFFDF5';
          roundRect(ctx, cx, cy, cell, cell, 12);
          ctx.fill();
          if (win) {
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#FFD54A';
            ctx.stroke();
          }
          const sym = q.grid[i][row];
          if (sym) drawSym(sym, cx, cy, cell, 1);
        }
      }
      // Лінії виграшу показуємо по черзі, як у справжніх автоматах.
      const allStopped = s.reels.every((r) => !r.spin);
      if (allStopped && q.lines.length) {
        busy = true;
        const k = Math.floor(Math.max(0, now - s.lineAt) / 1100) % q.lines.length;
        const line = q.lines[k];
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,61,139,0.9)';
        ctx.shadowColor = '#FF3D8B';
        ctx.shadowBlur = lite ? 0 : 10;
        ctx.beginPath();
        for (let i = 0; i < line.count; i++) {
          const px = i * step + size / 2;
          const py = line.rows[i] * step + size / 2;
          if (i === 0) ctx.moveTo(px - size * 0.45, py);
          ctx.lineTo(px, py);
          if (i === line.count - 1) ctx.lineTo(px + size * 0.45, py);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      if (waiting) busy = true;
      if (busy && s.alive) s.raf = requestAnimationFrame(frame);
      else running = false;
    };
    s.kick = () => {
      if (running || !s.alive) return;
      running = true;
      last = -1;
      s.raf = requestAnimationFrame(frame);
    };
    s.kick();
    return () => {
      cancelAnimationFrame(s.raf);
      running = false;
    };
  }, [W, H, s]);

  useEffect(() => {
    s.lineAt = performance.now();
  }, [props.lines, s]);

  // Будь-яка зміна пропсів (оберт, зупинка, підсвітка) будить цикл; у спокої він спить.
  useEffect(() => {
    s.kick();
  });

  useEffect(
    () => () => {
      s.alive = false;
      cancelAnimationFrame(s.raf);
    },
    [s],
  );

  return createElement('canvas', { ref, style: { width: W, height: H, display: 'block' } });
}
