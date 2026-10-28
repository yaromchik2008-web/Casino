import { useEffect, useRef } from 'react';
import { friendsEnabled } from '../config';
import { telegramName } from '../telegram';
import { formatCoins } from '../theme';
import { claimTransfers, reportTourney, startFriends, syncProfile, tourneyRound } from './friends';
import { assetsValue, statusFor } from './shop';
import { useWallet } from './WalletContext';

const SYNC_MS = 30000;

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
