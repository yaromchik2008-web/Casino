import { useSyncExternalStore } from 'react';

// Спливаюче повідомлення живе окремо від гаманця, щоб його показ не перемальовував увесь застосунок.
export interface ToastAction {
  label: string;
  primary?: boolean;
  onPress: () => void;
}

export interface Toast {
  text: string;
  /** Дотик до самого повідомлення (наприклад, відкрити чат). */
  onPress?: () => void;
  actions?: ToastAction[];
}

let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function hideToast() {
  if (timer) clearTimeout(timer);
  current = null;
  emit();
}

export function showToast(t: string | Toast, ms = 2800) {
  current = typeof t === 'string' ? { text: t } : t;
  emit();
  if (timer) clearTimeout(timer);
  timer = setTimeout(hideToast, ms);
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
