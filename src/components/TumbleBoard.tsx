import { useRef } from 'react';
import { getSettings } from '../audio/sound';
import type { Cell, TGrid } from '../games/tumbleEngine';
import { FONT, GameCanvas, drawEmoji, label, roundRect } from './canvasKit';

// Поле «лавини» на канвасі: символи падають з відскоком, виграшні лопаються, скатери пульсують.

interface Track {
  fromY: number; // у пікселях відносно цільової позиції
  at: number;
  ms: number;
}

export const COL_DELAY = 60;

const bounce = (t: number) => {
  // Та сама крива, що Easing.bounce у RN.
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
};

export function TumbleBoard({
  grid,
  remove,
  busy,
  size,
  gap,
  emojiOf,
}: {
  grid: TGrid;
  remove: boolean[][] | null;
  busy: boolean;
  size: number;
  gap: number;
  emojiOf: (c: Cell) => string;
}) {
  const cols = grid.length;
  const rows = grid[0]?.length ?? 0;
  const step = size + gap;
  const W = cols * size + (cols - 1) * gap;
  const H = rows * size + (rows - 1) * gap;
  const st = useRef({ rowOf: new Map<number, number>(), tracks: new Map<number, Track>(), popAt: 0, lastRemove: null as boolean[][] | null });
  const s = st.current;
  const now0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const lite = getSettings().lite;

  // Нове поле: кожна клітинка падає з того місця, де була (або згори, якщо нова).
  const seen = new Map<number, number>();
  // Стовпці рушають по черзі зліва направо, тож видно, як лавина котиться полем.
  grid.forEach((col, ci) =>
    col.forEach((c, r) => {
      seen.set(c.key, r);
      const prev = s.rowOf.get(c.key);
      if (prev === r) return;
      const from = prev === undefined ? -(r + 1.5) * step : (prev - r) * step;
      if (!lite) s.tracks.set(c.key, { fromY: from, at: now0 + ci * COL_DELAY, ms: 280 + r * 30 });
    }),
  );
  s.rowOf = seen;
  if (remove && remove !== s.lastRemove) s.popAt = now0;
  s.lastRemove = remove;

  const draw = (ctx: CanvasRenderingContext2D, now: number) => {
    ctx.clearRect(0, 0, W, H);
    let busyAnim = false;
    for (let ci = 0; ci < cols; ci++)
      for (let ri = 0; ri < rows; ri++) {
        const c = grid[ci][ri];
        let dy = 0;
        const tr = s.tracks.get(c.key);
        if (tr) {
          const t = Math.max(0, Math.min(1, (now - tr.at) / tr.ms));
          dy = tr.fromY * (1 - bounce(t));
          if (t >= 1) s.tracks.delete(c.key);
          else busyAnim = true;
        }
        let scale = 1;
        if (remove?.[ci][ri]) {
          const t = (now - s.popAt) / 520;
          scale = t < 0.35 ? 1 + 0.25 * (t / 0.35) : t < 0.62 ? 1.25 - 0.25 * ((t - 0.35) / 0.27) : Math.max(0, 1 - (t - 0.62) / 0.38);
          if (t < 1) busyAnim = true;
        } else if (!busy && c.kind === 'scatter' && !lite) {
          scale = 1 + 0.075 * (1 - Math.cos((now / 700) * Math.PI * 2));
          busyAnim = true;
        }
        if (scale <= 0.01) continue;
        const x = ci * step + size / 2;
        const y = ri * step + size / 2 + dy;
        const d = size * scale;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        roundRect(ctx, x - d / 2, y - d / 2, d, d, 10 * scale);
        ctx.fill();
        drawEmoji(ctx, emojiOf(c), x, y, d * 0.62);
        if (c.kind === 'bomb') {
          const txt = `×${c.mult}`;
          ctx.font = `900 11px ${FONT}`;
          const w = ctx.measureText(txt).width + 8;
          ctx.fillStyle = '#FF3D8B';
          roundRect(ctx, x + d / 2 - w, y + d / 2 - 15, w, 15, 7);
          ctx.fill();
          label(ctx, txt, x + d / 2 - w / 2, y + d / 2 - 7.5, 11, '#FFFFFF', 900, '');
        }
      }
    return busyAnim;
  };

  return <GameCanvas width={W} height={H} draw={draw} />;
}
