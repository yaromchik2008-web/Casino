import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// На айфоні (особливо в Telegram) клавіатура зсуває сторінку і лишає порожній екран.
// Тримаємо застосунок рівно у видимій частині екрана і ховаємо нижнє меню, поки відкрита клавіатура.
export function useKeyboardViewport() {
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    if (!touch) return;
    const vv = window.visualViewport;
    const body = document.body;
    const html = document.documentElement;
    html.style.overflow = 'hidden';
    html.style.height = '100%';
    Object.assign(body.style, { position: 'fixed', left: '0', right: '0', top: '0', overflow: 'hidden', overscrollBehavior: 'none' });
    let fullHeight = window.innerHeight;

    const editing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const update = () => {
      const h = vv ? vv.height : window.innerHeight;
      const top = vv ? vv.offsetTop : 0;
      if (!editing()) fullHeight = Math.max(window.innerHeight, h);
      body.style.height = `${Math.round(h)}px`;
      body.style.top = `${Math.round(top)}px`;
      if (window.scrollY !== 0 && !vv) window.scrollTo(0, 0);
      setKeyboard(editing() && fullHeight - h > 120);
    };
    const onFocus = () => setTimeout(update, 50);
    const onBlur = () =>
      setTimeout(() => {
        window.scrollTo(0, 0);
        update();
      }, 50);

    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
    };
  }, []);
  return keyboard;
}
