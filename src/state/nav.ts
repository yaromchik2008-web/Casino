// Переходи з будь-якого місця гри: сповіщення відкриває чат з другом або приймає дуель.
export type NavRequest = { tab: 'friends'; chat?: string; acceptDuel?: number };

let pending: NavRequest | null = null;
const listeners = new Set<(r: NavRequest) => void>();

export function requestNav(r: NavRequest) {
  pending = r;
  listeners.forEach((l) => l(r));
}

/** Забирає запит (його виконує той, хто прийшов першим). */
export function takeNav(): NavRequest | null {
  const r = pending;
  pending = null;
  return r;
}

export function peekNav() {
  return pending;
}

export function onNav(l: (r: NavRequest) => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
