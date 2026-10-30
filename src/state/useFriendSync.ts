import { useEffect, useRef } from 'react';
import { friendsEnabled } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { telegramName, telegramStartParam } from '../telegram';
import { formatCoins } from '../theme';
import { sfx } from '../audio/sound';
import { showToast } from './toast';
import { requestNav } from './nav';
import { claimReferral, listDuels, respondDuel, friendlyError, claimTransfers, claimTransfers2, cloudStateOn, inboxSince, takeAdminActions, takeBalanceOverride, myProfile, reportTourney, startFriends, syncProfile, tourneyRound } from './friends';
import { assetsValue, statusFor } from './shop';
import { useWallet } from './WalletContext';

const SYNC_MS = 30000;
const INBOX_MS = 6000;
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
    const { credit: add, total: got } = await claimTransfers2().catch(() => ({ credit: 0, total: 0 }));
    if (add > 0) credit(add);
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
        // Коли стан на сервері (v13), баланс і майно в профілі оновлює сам сервер.
        await syncProfile(
          cloudStateOn()
            ? { level: s.level, status: `${status.emoji} ${status.title}` }
            : { balance: s.balance, level: s.level, status: `${status.emoji} ${status.title}`, owned: s.owned },
        );
        await tryReferral(ref.current.notify, ref.current.credit).catch(() => {});
        if (s.tourney && s.tourney.round === tourneyRound()) await reportTourney(s.tourney.round, s.tourney.net).catch(() => {});
        await money();
      } catch {
        // Без мережі просто пропускаємо цей раз.
      }
    };
    // Гроші й команди розробника забираємо часто, щоб баланс мінявся одразу.
    const money = async () => {
      if (!myProfile()) return;
      for (const a of await takeAdminActions()) if (!stopped) ref.current.adminApply(a);
      const got = await claimTransfers2();
      if (got.total > 0 && !stopped) {
        if (got.credit > 0) ref.current.credit(got.credit);
        ref.current.notify(`👥 Зараховано ${formatCoins(got.total)}: подарунок, дуель або турнір`);
      }
    };
    // Спливаюче сповіщення, коли хтось пише або кличе на дуель.
    let since: string | null = null;
    const inbox = async () => {
      if (!myProfile()) return;
      await money().catch(() => {});
      try {
        const r = await inboxSince(since);
        since = r.latest;
        const last = r.items[r.items.length - 1];
        if (!last || stopped) return;
        const more = r.items.length > 1 ? ` (+ ще ${r.items.length - 1})` : '';
        const openChat = () => requestNav({ tab: 'friends', chat: last.sender });
        if (last.body.startsWith('⚔️')) {
          // Виклик на дуель: одразу кнопки «Прийняти» і «Відхилити».
          const duel = (await listDuels().catch(() => [])).find((d) => d.status === 'pending' && d.challenger === last.sender && d.opponent === myProfile()?.id);
          showToast(
            {
              text: duel ? `⚔️ ${last.name} кличе на дуель · ставка ${formatCoins(duel.stake)}` : `⚔️ ${last.name} кличе тебе на дуель!`,
              onPress: openChat,
              actions: duel
                ? [
                    { label: 'Прийняти', primary: true, onPress: () => requestNav({ tab: 'friends', acceptDuel: duel.id }) },
                    {
                      label: 'Відхилити',
                      onPress: () =>
                        respondDuel(duel.id, false)
                          .then(() => ref.current.notify('Виклик відхилено'))
                          .catch((e) => ref.current.notify(friendlyError(e))),
                    },
                  ]
                : undefined,
            },
            20000,
          );
        } else {
          showToast({ text: `💬 ${last.name}: ${last.body.slice(0, 80)}${more}`, onPress: openChat }, 5000);
        }
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
