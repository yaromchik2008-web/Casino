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

export const BETS = [10, 25, 50, 100, 250, 500];

export function formatCoins(n: number): string {
  return Math.floor(n).toLocaleString('uk-UA');
}
