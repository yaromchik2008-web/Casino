export const colors = {
  bg: '#0D0A23',
  surface: '#1B1540',
  surfaceAlt: '#261D57',
  border: '#3A2E7A',
  text: '#FFFFFF',
  muted: '#A99BD6',
  gold: '#FFD54A',
  accent: '#FF3D8B',
  green: '#22C55E',
  red: '#EF4444',
  blue: '#3B82F6',
};

// Усі суми зберігаються в копійках ігрових гривень: 100 = 1 ₴. Мінімальна ставка 1 ₴.
export const MIN_BET = 100;
export const MAX_BET = 1000000; // 10 000 ₴
export const BETS = [100, 200, 500, 1000, 2000, 5000, 10000, 50000, 100000, 1000000];
export const CURRENCY = '₴';

export function formatCoins(n: number): string {
  const v = Math.round(n) / 100;
  return `${v.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY}`;
}

/** Коротко для фішок і кнопок: 0.15, 1, 2.5, 50. */
export function formatShort(n: number): string {
  const v = Math.round(n) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '');
}
