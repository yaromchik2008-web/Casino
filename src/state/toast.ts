import { useSyncExternalStore } from 'react';

// Спливаюче повідомлення живе окремо від гаманця, щоб його показ не перемальовував увесь застосунок.
let text: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function showToast(t: string, ms = 2800) {
  text = t;
  emit();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    text = null;
    emit();
  }, ms);
}

export function useToast(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => text,
  );
}
