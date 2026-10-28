import { useEffect, useRef } from 'react';
import { friendsEnabled } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { telegramName, telegramStartParam } from '../telegram';
import { formatCoins } from '../theme';
import { claimReferral, claimTransfers, reportTourney, startFriends, syncProfile, tourneyRound } from './friends';
import { assetsValue, statusFor } from './shop';
import { useWallet } from './WalletContext';

const SYNC_MS = 30000;
const REF_DONE = 'freecasino:ref-done';

// Код друга з посилання-запрошення: t.me/бот?startapp=ref_КОД або сайт ?ref=КОД.
function referralFromLink(): string | null {
  const start = telegramStartParam();
  const m = start?.match(/^ref_([A-Z0-9]{6})$/i);
  if (m) return m[1].toUpperCase();
  if (Platform.OS === 'web' && typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('ref');
    if (q && /^[A-Z0-9]{6}$/i.test(q)) return q.toUpperCase();
  }
  return null;
}

async function tryReferral(notify: (t: string) => void) {
  const code = referralFromLink();
  if (!code || (await AsyncStorage.getItem(REF_DONE))) return;
  try {
    const name = await claimReferral(code);
    notify(`🎉 ${name} запросив тебе! Вам обом по 200 ₴`);
    await AsyncStorage.setItem(REF_DONE, code);
  } catch (e) {
    const msg = String((e as { message?: string })?.message ?? e);
    // Остаточні відмови більше не пробуємо; помилки мережі спробуємо наступного разу.
    if (/already_referred|self|not_found|referral_too_late|referral_limit/.test(msg)) await AsyncStorage.setItem(REF_DONE, code);
  }
}

/** Раз на 30 секунд показує друзям мій рахунок, оновлює очки турніру і забирає надіслані мені гроші. */
export function useFriendSync() {
  const wallet = useWallet();
  const ref = useRef(wallet);
  ref.current = wallet;

  useEffect(() => {
    if (!friendsEnabled() || !wallet.loaded) return;
    let stopped = false;
    const tick = async () => {
      try {
        await startFriends(telegramName() ?? 'Гравець');
        const s = ref.current.state;
        const status = statusFor(s.balance + assetsValue(s.owned));
        await syncProfile({ balance: s.balance, level: s.level, status: `${status.emoji} ${status.title}`, owned: s.owned });
        await tryReferral(ref.current.notify).catch(() => {});
        if (s.tourney && s.tourney.round === tourneyRound()) await reportTourney(s.tourney.round, s.tourney.net).catch(() => {});
        const got = await claimTransfers();
        if (got > 0 && !stopped) {
          ref.current.credit(got);
          ref.current.notify(`👥 Зараховано ${formatCoins(got)}: подарунок, дуель або турнір`);
        }
      } catch {
        // Без мережі просто пропускаємо цей раз.
      }
    };
    tick();
    const t = setInterval(tick, SYNC_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [wallet.loaded]);
}
