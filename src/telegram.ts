import { Platform } from 'react-native';
import { colors } from './theme';

// Мінімальний опис Telegram Mini App API, який ми використовуємо.
interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { first_name?: string; username?: string } };
  ready: () => void;
  expand: () => void;
  isVersionAtLeast: (v: string) => boolean;
  setHeaderColor: (c: string) => void;
  setBackgroundColor: (c: string) => void;
  disableVerticalSwipes?: () => void;
  CloudStorage?: {
    setItem: (key: string, value: string, cb?: (err: string | null, ok?: boolean) => void) => void;
    getItem: (key: string, cb: (err: string | null, value?: string) => void) => void;
  };
  BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
    notificationOccurred: (type: 'success' | 'error' | 'warning') => void;
    selectionChanged: () => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

let app: TelegramWebApp | null = null;

function current(): TelegramWebApp | null {
  if (app) return app;
  const candidate = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
  // Скрипт створює об'єкт і поза Telegram, але initData порожній.
  if (candidate && candidate.initData) app = candidate;
  return app;
}

export function initTelegram(onReady: () => void) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const start = () => {
    const tg = current();
    if (!tg) return;
    tg.ready();
    tg.expand();
    if (tg.isVersionAtLeast('6.1')) {
      tg.setHeaderColor(colors.surface);
      tg.setBackgroundColor(colors.bg);
    }
    if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes?.();
    onReady();
  };
  if (window.Telegram?.WebApp) {
    start();
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://telegram.org/js/telegram-web-app.js';
  script.async = true;
  script.onload = start;
  document.head.appendChild(script);
}

export function isTelegram(): boolean {
  return !!current();
}

export function telegramName(): string | undefined {
  return current()?.initDataUnsafe.user?.first_name;
}

export function telegramHaptic(kind: 'tap' | 'win' | 'lose'): boolean {
  const tg = current();
  if (!tg || !tg.isVersionAtLeast('6.1')) return false;
  if (kind === 'win') tg.HapticFeedback.notificationOccurred('success');
  else if (kind === 'lose') tg.HapticFeedback.impactOccurred('medium');
  else tg.HapticFeedback.selectionChanged();
  return true;
}

// Системна кнопка «Назад» у шапці Telegram.
export function setTelegramBack(handler: (() => void) | null): () => void {
  const tg = current();
  if (!tg || !tg.isVersionAtLeast('6.1')) return () => {};
  if (!handler) {
    tg.BackButton.hide();
    return () => {};
  }
  tg.BackButton.onClick(handler);
  tg.BackButton.show();
  return () => tg.BackButton.offClick(handler);
}

// Хмарне сховище Telegram: зберігається для гравця на всіх його пристроях і не зникає,
// коли айфон чистить пам'ять вбудованого браузера.
export function cloudGet(key: string): Promise<string | null> {
  const tg = current();
  if (!tg?.CloudStorage || !tg.isVersionAtLeast('6.9')) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      tg.CloudStorage!.getItem(key, (err, value) => resolve(err ? null : value || null));
    } catch {
      resolve(null);
    }
  });
}

export function cloudSet(key: string, value: string): Promise<void> {
  const tg = current();
  if (!tg?.CloudStorage || !tg.isVersionAtLeast('6.9')) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      tg.CloudStorage!.setItem(key, value, () => resolve());
    } catch {
      resolve();
    }
  });
}

/** Чекає, поки підвантажиться скрипт Telegram (до 3 с), щоб знати, чи ми в міні-аппі. */
export async function waitTelegram(ms = 3000): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (window.Telegram?.WebApp) return !!current();
    await new Promise((r) => setTimeout(r, 100));
  }
  return !!current();
}
