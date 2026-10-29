import { createElement, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

// Спільне для ігор на канвасі: цикл, що працює лише поки є анімація, кеш картинок і емодзі, дрібні фігури.

export const WEB = Platform.OS === 'web';

export type Ctx = CanvasRenderingContext2D;

/**
 * Канвас з циклом малювання. draw повертає true, поки треба малювати наступний кадр;
 * будь-який новий рендер компонента знову будить цикл.
 */
export function GameCanvas({
  width,
  height,
  draw,
  dprMax = 3,
  style,
  onKick,
}: {
  width: number;
  height: number;
  draw: (ctx: Ctx, now: number, dt: number) => boolean;
  dprMax?: number;
  style?: object;
  /** Віддає функцію, що будить цикл без рендеру React (для імперативних spin()). */
  onKick?: (kick: () => void) => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const st = useRef({ raf: 0, running: false, alive: true, last: -1, kick: () => {} });
  const s = st.current;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(dprMax, (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio ?? 1);
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const frame = (now: number) => {
      const dt = s.last < 0 ? 0 : Math.min(50, now - s.last) / 1000;
      s.last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingQuality = 'high';
      const more = drawRef.current(ctx, now, dt);
      if (more && s.alive) s.raf = requestAnimationFrame(frame);
      else s.running = false;
    };
    s.kick = () => {
      if (s.running || !s.alive) return;
      s.running = true;
      s.last = -1;
      s.raf = requestAnimationFrame(frame);
    };
    s.running = false;
    onKick?.(() => s.kick());
    s.kick();
    return () => {
      cancelAnimationFrame(s.raf);
      s.running = false;
    };
  }, [width, height, dprMax, s]);

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

  return createElement('canvas', { ref, style: { width, height, display: 'block', ...style } });
}

type Img = HTMLImageElement;
const imgCache = new Map<unknown, Img>();
/** Картинка з require(); null, поки не завантажилась. */
export function imageOf(src: unknown): Img | null {
  if (typeof document === 'undefined' || src == null) return null;
  let im = imgCache.get(src);
  if (!im) {
    im = document.createElement('img');
    const o = src as string | { uri?: string; default?: string };
    im.src = typeof o === 'string' ? o : (o?.uri ?? o?.default ?? '');
    imgCache.set(src, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}

const emojiCache = new Map<string, HTMLCanvasElement>();
/** Емодзі, один раз відмальоване в маленький канвас (fillText з емодзі дуже повільний). */
export function emojiOf(e: string, px: number) {
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

/** Малює емодзі по центру (x, y) розміром d. */
export function drawEmoji(ctx: Ctx, e: string, x: number, y: number, d: number) {
  // Емодзі рендеримо з урахуванням щільності екрана, щоб не було мила.
  const k = ctx.getTransform().a || 1;
  const im = emojiOf(e, Math.max(8, Math.round(d * k)));
  const s = d * 1.4;
  ctx.drawImage(im, x - s / 2, y - s / 2, s, s);
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Текст з обведенням для читабельності на будь-якому фоні. */
export function label(ctx: Ctx, text: string, x: number, y: number, size: number, color = '#FFFFFF', weight = 900, stroke = 'rgba(0,0,0,0.75)') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size / 5);
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export const easeOutCubic = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
