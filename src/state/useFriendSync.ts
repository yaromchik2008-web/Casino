import { useEffect, useRef } from 'react';
import { friendsEnabled } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { telegramName, telegramStartParam } from '../telegram';
import { formatCoins } from '../theme';
import { sfx } from '../audio/sound';
import { claimReferral, claimTransfers, inboxSince, takeAdminActions, takeBalanceOverride, myProfile, reportTourney, startFriends, syncProfile, tourneyRound } from './friends';
import { assetsValue, statusFor } from './shop';
import { useWallet } from './WalletContext';

const SYNC_MS = 30000;
const INBOX_MS = 8000;
const REF_DONE = 'freecasino:ref-done';
const REF_PENDING = 'freecasino:ref-pending';

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

// Код із посилання запам'ятовуємо одразу: Telegram може перезапустити гру вже без ?ref=.
const linkCode = referralFromLink();
if (linkCode) AsyncStorage.setItem(REF_PENDING, linkCode).catch(() => {});

/** Повертає суму, яку одразу зарахували запрошеному (200 ₴), або 0. */
async function tryReferral(notify: (t: string) => void, credit: (n: number) => void) {
  const code = linkCode ?? (await AsyncStorage.getItem(REF_PENDING));
  if (!code || (await AsyncStorage.getItem(REF_DONE))) return;
  try {
    const name = await claimReferral(code);
    await AsyncStorage.setItem(REF_DONE, code);
    // Бонус забираємо й зараховуємо відразу, щоб запрошений побачив свої 200 ₴.
    const got = await claimTransfers().catch(() => 0);
    if (got > 0) credit(got);
    notify(`🎉 ${name} запросив тебе! Тобі +${formatCoins(got || 20000)}, другу теж`);
  } catch (e) {
    const msg = String((e as { message?: string })?.message ?? e);
    // Остаточні відмови більше не пробуємо; помилки мережі й «профіль ще не створився» спробуємо наступного разу.
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
        const forced = await takeBalanceOverride();
        if (forced != null && !stopped) {
          ref.current.setBalance(forced);
          ref.current.notify(`🛠️ Адмін встановив баланс: ${formatCoins(forced)}`);
        }
        const s = forced != null ? { ...ref.current.state, balance: forced } : ref.current.state;
        const status = statusFor(s.balance + assetsValue(s.owned));
        await syncProfile({ balance: s.balance, level: s.level, status: `${status.emoji} ${status.title}`, owned: s.owned });
        await tryReferral(ref.current.notify, ref.current.credit).catch(() => {});
        for (const a of await takeAdminActions()) if (!stopped) ref.current.adminApply(a);
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
    // Спливаюче сповіщення, коли хтось пише або кличе на дуель.
    let since: string | null = null;
    const inbox = async () => {
      if (!myProfile()) return;
      try {
        const r = await inboxSince(since);
        since = r.latest;
        const last = r.items[r.items.length - 1];
        if (!last || stopped) return;
        const text = last.body.startsWith('⚔️')
          ? `⚔️ ${last.name} кличе тебе на дуель! Зайди в «Друзі»`
          : `💬 ${last.name}: ${last.body.slice(0, 80)}`;
        ref.current.notify(r.items.length > 1 ? `${text} (+ ще ${r.items.length - 1})` : text);
        sfx('bonus', 0.5);
      } catch {
        // Пропускаємо до наступного разу.
      }
    };
    tick();
    const t = setInterval(tick, SYNC_MS);
    const ib = setInterval(inbox, INBOX_MS);
    return () => {
      stopped = true;
      clearInterval(t);
      clearInterval(ib);
    };
  }, [wallet.loaded]);
}
