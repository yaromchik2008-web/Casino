import { showToast } from './toast';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  GameGroup,
  dailyMissions,
  dayId,
  levelFromXp,
  levelName,
  levelReward,
  MAX_LEVEL,
  xpForLevel,
  sportOfDay,
  weekId,
  XP_PER_KOPECKS,
} from './progress';
import { formatCoins } from '../theme';
import { ACHIEVEMENTS } from './achievements';
import { INCOME_CAP_HOURS, findItem, refundRemoved, hourlyIncome, sellPrice, vehicleBoost } from './shop';
import { SportBet, SportPick, betResult, getMatch } from './sports';
import { AdminAction, PromoResult, cloudStateOn, loadState, myProfile, redeemPromoOnServer, saveState, tourneyRound } from './friends';
import { merge3 } from './merge';
import { friendsEnabled } from '../config';
import { AppState, Platform } from 'react-native';
import { PICKAXES } from '../games/mineEngine';
import { findGame } from '../games/catalog';

// Бонус до виграшів прибрано на прохання ghj (2026-10-31): гра знову віддає менше, ніж забирає.
// Слоти, шахта й каскади ≈ 0.86–0.92, швидкі й настільні ≈ 0.95–0.99.
export function winBoost(_gameId: string) {
  return 1;
}

const KEY = 'freecasino:player:v3';
// Остання версія стану з сервера, з якою цей пристрій синхронізувався (для злиття змін).
const SYNC_KEY = 'freecasino:sync:v1';
const PULL_MS = 4000;
const PUSH_DELAY_MS = 1500;

export const START_BALANCE = 30000; // усі суми в копійках: 30000 = 300,00 ₴
export const HOURLY_BONUS = 2000;
export const HOURLY_COOLDOWN_MS = 60 * 60 * 1000;
export const WHEEL_COOLDOWN_MS = 4 * 60 * 60 * 1000;
export const DAILY_REWARDS = [1000, 1500, 2000, 3000, 4000, 5000, 10000];
export const JACKPOT_SEED = 100000;
export const CASHBACK_RATE = 0.02;

export interface PlayerState {
  balance: number;
  xp: number;
  level: number;
  bets: number;
  totalBet: number;
  totalWon: number;
  biggestWin: number;
  played: Record<string, number>;
  recent: string[];
  favorites: string[];
  lastHourlyAt: number;
  lastWheelAt: number;
  dailyStreak: number;
  lastDailyDay: string;
  jackpotPool: number;
  lossSinceCashback: number;
  lastCashbackDay: string;
  missionDay: string;
  missionProgress: Record<string, number>;
  missionPlayed: string[];
  missionClaimed: string[];
  tournamentWeek: string;
  tournamentPoints: number;
  pickaxe: number;
  owned: string[];
  incomeAt: number;
  stats: Record<string, number>;
  achievements: string[];
  sportBets: SportBet[];
  promoUsed: string[];
  lastResetAt?: number;
  // Турнір на 6 годин: в якому раунді граю і скільки заробив (виграші мінус ставки).
  tourney?: { round: number; net: number };
  xpV: number;
  /** Номери з «Автономерів»: id — сам номер, value — за скільки продається. */
  plates?: { id: string; value: number }[];
}

function initialState(): PlayerState {
  return {
    balance: START_BALANCE,
    xp: 0,
    level: 1,
    bets: 0,
    totalBet: 0,
    totalWon: 0,
    biggestWin: 0,
    played: {},
    recent: [],
    favorites: [],
    lastHourlyAt: 0,
    lastWheelAt: 0,
    dailyStreak: 0,
    lastDailyDay: '',
    jackpotPool: JACKPOT_SEED,
    lossSinceCashback: 0,
    lastCashbackDay: '',
    missionDay: dayId(),
    missionProgress: {},
    missionPlayed: [],
    missionClaimed: [],
    tournamentWeek: weekId(),
    tournamentPoints: 0,
    pickaxe: 0,
    owned: [],
    incomeAt: Date.now(),
    stats: {},
    achievements: [],
    sportBets: [],
    promoUsed: [],
    xpV: 2,
  };
}

// Скидає щоденні завдання і закриває минулий турнір, коли настає новий день або тиждень.
function rollPeriods(s: PlayerState, notes: string[]): PlayerState {
  let next = s;
  const today = dayId();
  if (next.missionDay !== today) {
    next = { ...next, missionDay: today, missionProgress: {}, missionPlayed: [], missionClaimed: [] };
  }
  // Тижневий турнір прибрали (за бажанням ghj), лише скидаємо старі очки.
  const week = weekId();
  if (next.tournamentWeek !== week) next = { ...next, tournamentWeek: week, tournamentPoints: 0 };
  void notes;
  return next;
}

interface WalletApi {
  state: PlayerState;
  loaded: boolean;
  bet: (gameId: string, group: GameGroup, amount: number) => boolean;
  win: (gameId: string, amount: number) => void;
  notify: (text: string) => void;
  claimHourly: () => boolean;
  claimDaily: () => number;
  claimWheel: (amount: number) => void;
  claimCashback: () => number;
  claimMission: (id: string) => number;
  winJackpot: () => number;
  toggleFavorite: (gameId: string) => void;
  spend: (amount: number) => boolean;
  credit: (amount: number) => void;
  track: (stat: string, n?: number) => void;
  buyItem: (id: string) => boolean;
  sellItem: (id: string) => number;
  pendingIncome: () => number;
  collectIncome: () => number;
  buyPickaxe: (level: number) => boolean;
  claimAchievement: (id: string) => number;
  placeSportBet: (picks: SportPick[], stake: number) => boolean;
  redeemPromo: (code: string) => Promise<PromoResult>;
  /** Виставляє баланс, який задав адмін на сервері. */
  setBalance: (amount: number) => void;
  enterTourney: (round: number) => void;
  grantItem: (id: string) => 'item' | 'cash' | 'none';
  /** Команда з термінала розробника (баланс, майно, рівень, повідомлення). */
  adminApply: (a: AdminAction) => void;
  addPlate: (id: string, value: number) => void;
  /** Прибирає номер з майна і зараховує його ціну. */
  sellPlate: (id: string) => number;
  /** Блокування від розробника: до якого часу і за що. */
  banned: { until: string; note: string | null } | null;
  openGame: (gameId: string) => void;
  reset: () => boolean;
}

const WalletContext = createContext<WalletApi | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerState>(initialState);
  const [loaded, setLoaded] = useState(false);
  const stateRef = useRef(state);

  const notify = useCallback((text: string) => showToast(text), []);

  const commit = useCallback(
    (fn: (s: PlayerState) => PlayerState) => {
      const notes: string[] = [];
      const prev = rollPeriods(stateRef.current, notes);
      let next = fn(prev);
      const level = levelFromXp(next.xp);
      if (level > next.level) {
        let reward = 0;
        for (let l = next.level + 1; l <= level; l++) reward += levelReward(l);
        next = { ...next, level, balance: next.balance + reward };
        notes.push(`Новий рівень: ${levelName(level)}! +${formatCoins(reward)}`);
      }
      stateRef.current = next;
      setState(next);
      if (notes.length) notify(notes.join('\n'));
      return next;
    },
    [notify],
  );

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          const notes: string[] = [];
          const saved = JSON.parse(raw);
          // Старі збереження рахували 1 XP за копійку: переводимо на нову, повільнішу шкалу.
          if (!saved.xpV) saved.xp = Math.round((saved.xp ?? 0) / XP_PER_KOPECKS);
          const { state: cleaned, refund } = refundRemoved({ ...initialState(), ...saved, xpV: 2 } as PlayerState);
          if (refund > 0) notes.push(`🚗 Частину майна прибрали з магазину: повернули ${formatCoins(refund)}`);
          const restored = rollPeriods(cleaned, notes);
          stateRef.current = restored;
          setState(restored);
          if (notes.length) notify(notes.join('\n'));
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [notify]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state, loaded]);

  // Синхронізація з сервером: телефон і комп'ютер з тим самим кодом бачать один баланс і майно,
  // а подарунки й команди розробника приходять одразу, навіть якщо гравця не було в грі.
  const [banned, setBanned] = useState<WalletApi['banned']>(null);
  const sync = useRef<{ rev: number; base: PlayerState | null; busy: boolean; timer: ReturnType<typeof setTimeout> | null }>({
    rev: 0,
    base: null,
    busy: false,
    timer: null,
  });
  const syncNow = useRef<() => void>(() => {});
  useEffect(() => {
    if (!loaded || !friendsEnabled()) return;
    let stopped = false;
    const sc = sync.current;
    const adopt = (next: PlayerState) => {
      stateRef.current = next;
      setState(next);
    };
    const fromServer = (raw: Record<string, unknown>) => rollPeriods({ ...initialState(), ...(raw as Partial<PlayerState>), xpV: 2 }, []);
    const remember = () => AsyncStorage.setItem(SYNC_KEY, JSON.stringify({ rev: sc.rev, base: sc.base })).catch(() => {});
    // Зливає серверний стан з нашим і повертає, чи лишились у нас незбережені зміни.
    const absorb = (rev: number, raw: Record<string, unknown> | null | undefined) => {
      if (!raw) return;
      const server = fromServer(raw);
      const local = stateRef.current;
      const base = sc.base;
      let next: PlayerState;
      if (!base || (server as { resetAt?: number }).resetAt !== (base as { resetAt?: number }).resetAt) {
        // Перший раз на цьому пристрої або розробник скинув прогрес: беремо серверне повністю.
        next = server;
      } else {
        next = merge3(base as unknown as Record<string, unknown>, local as unknown as Record<string, unknown>, server as unknown as Record<string, unknown>) as unknown as PlayerState;
      }
      sc.rev = rev;
      sc.base = server;
      remember();
      const { state: cleaned, refund } = refundRemoved(next);
      if (refund > 0) notify(`🚗 Частину майна прибрали з магазину: повернули ${formatCoins(refund)}`);
      if (JSON.stringify(cleaned) !== JSON.stringify(local)) adopt(cleaned);
    };
    const push = async () => {
      if (sc.busy || stopped || !cloudStateOn()) return;
      const snap = stateRef.current;
      if (sc.base && JSON.stringify(snap) === JSON.stringify(sc.base)) return;
      sc.busy = true;
      try {
        const r = await saveState(snap, sc.rev);
        if (r.ok) {
          sc.rev = r.rev;
          sc.base = snap;
          remember();
        } else {
          // Сервер урізав підозрілий виграш: беремо його стан повністю, без злиття.
          if (r.clamped) sc.base = null;
          absorb(r.rev, r.state);
          if (!r.clamped) schedule();
        }
      } catch {
        // Без мережі збережемо наступного разу.
      }
      sc.busy = false;
    };
    const pull = async () => {
      if (sc.busy || stopped || !myProfile()) return;
      sc.busy = true;
      try {
        const r = await loadState(sc.rev);
        if (r && !stopped) {
          const until = r.banned_until && (r.banned_until === 'infinity' || new Date(r.banned_until).getTime() > Date.now()) ? r.banned_until : null;
          setBanned((b) => (until ? (b?.until === until ? b : { until, note: r.ban_note }) : null));
          if (r.state) absorb(r.rev, r.state);
          else if (r.rev === 0) sc.base = sc.base ?? null; // на сервері ще порожньо: перший push покладе наш стан
        }
      } catch {
        // Пропускаємо.
      }
      sc.busy = false;
      await push();
    };
    const schedule = () => {
      if (sc.timer) clearTimeout(sc.timer);
      sc.timer = setTimeout(() => void push(), PUSH_DELAY_MS);
    };
    syncNow.current = schedule;
    AsyncStorage.getItem(SYNC_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw);
        sc.rev = Number(saved.rev) || 0;
        sc.base = saved.base ?? null;
      })
      .catch(() => {})
      .finally(() => void pull());
    const t = setInterval(() => void pull(), PULL_MS);
    // Коли гру згортають, зберігаємо одразу.
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') void push();
      else void pull();
    });
    const onHide = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') void push();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onHide);
    return () => {
      stopped = true;
      clearInterval(t);
      if (sc.timer) clearTimeout(sc.timer);
      sub.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide);
    };
  }, [loaded]);

  useEffect(() => {
    if (loaded) syncNow.current();
  }, [state, loaded]);

  const bet = useCallback(
    (gameId: string, group: GameGroup, amount: number) => {
      if (amount <= 0 || stateRef.current.balance < amount) return false;
      commit((s) => {
        const progress = { ...s.missionProgress };
        progress.bets = (progress.bets ?? 0) + 1;
        progress.grind = (progress.grind ?? 0) + 1;
        progress[group] = (progress[group] ?? 0) + 1;
        const missionPlayed = s.missionPlayed.includes(gameId) ? s.missionPlayed : [...s.missionPlayed, gameId];
        progress.variety = missionPlayed.length;
        return {
          ...s,
          balance: s.balance - amount,
          xp: s.xp + amount / XP_PER_KOPECKS,
          bets: s.bets + 1,
          totalBet: s.totalBet + amount,
          played: { ...s.played, [gameId]: (s.played[gameId] ?? 0) + 1 },
          jackpotPool: s.jackpotPool + Math.ceil(amount * 0.02),
          lossSinceCashback: s.lossSinceCashback + amount,
          tourney: s.tourney && s.tourney.round === tourneyRound() ? { ...s.tourney, net: s.tourney.net - amount } : s.tourney,
          missionProgress: progress,
          missionPlayed,
        };
      });
      return true;
    },
    [commit],
  );

  const win = useCallback(
    (gameId: string, amount: number) => {
      if (amount <= 0) return;
      // Бонус удачі (за бажанням ghj): гравець у середньому виходить у невеликий плюс.
      // Плюс 0,5 % за кожен куплений транспорт.
      const rounded = Math.round(amount * winBoost(gameId) * vehicleBoost(stateRef.current.owned));
      commit((s) => ({
        ...s,
        balance: s.balance + rounded,
        totalWon: s.totalWon + rounded,
        biggestWin: Math.max(s.biggestWin, rounded),
        lossSinceCashback: Math.max(0, s.lossSinceCashback - rounded),
        tournamentPoints: s.tournamentPoints + rounded,
        tourney: s.tourney && s.tourney.round === tourneyRound() ? { ...s.tourney, net: s.tourney.net + rounded } : s.tourney,
        missionProgress:
          rounded >= 10000 ? { ...s.missionProgress, bigwin: 1 } : s.missionProgress,
      }));
    },
    [commit],
  );

  const claimHourly = useCallback(() => {
    const s = stateRef.current;
    const broke = s.balance < 10;
    if (!broke && Date.now() - s.lastHourlyAt < HOURLY_COOLDOWN_MS) return false;
    commit((p) => ({ ...p, balance: p.balance + HOURLY_BONUS, lastHourlyAt: Date.now() }));
    return true;
  }, [commit]);

  const claimDaily = useCallback(() => {
    const s = stateRef.current;
    const today = dayId();
    if (s.lastDailyDay === today) return 0;
    const yesterday = dayId(new Date(Date.now() - 24 * 3600 * 1000));
    const streak = s.lastDailyDay === yesterday ? s.dailyStreak + 1 : 1;
    const reward = DAILY_REWARDS[(streak - 1) % DAILY_REWARDS.length];
    commit((p) => ({ ...p, balance: p.balance + reward, dailyStreak: streak, lastDailyDay: today }));
    return reward;
  }, [commit]);

  const claimWheel = useCallback(
    (amount: number) => {
      commit((p) => ({ ...p, balance: p.balance + amount, lastWheelAt: Date.now() }));
    },
    [commit],
  );

  const claimCashback = useCallback(() => {
    const s = stateRef.current;
    const amount = Math.floor(s.lossSinceCashback * CASHBACK_RATE);
    if (amount <= 0 || s.lastCashbackDay === dayId()) return 0;
    commit((p) => ({ ...p, balance: p.balance + amount, lossSinceCashback: 0, lastCashbackDay: dayId() }));
    return amount;
  }, [commit]);

  const claimMission = useCallback(
    (id: string) => {
      const mission = dailyMissions().find((m) => m.id === id);
      const s = stateRef.current;
      if (!mission || s.missionClaimed.includes(id) || (s.missionProgress[id] ?? 0) < mission.goal) return 0;
      commit((p) => ({ ...p, balance: p.balance + mission.reward, missionClaimed: [...p.missionClaimed, id] }));
      return mission.reward;
    },
    [commit],
  );

  const winJackpot = useCallback(() => {
    const amount = stateRef.current.jackpotPool;
    commit((p) => ({
      ...p,
      balance: p.balance + amount,
      totalWon: p.totalWon + amount,
      biggestWin: Math.max(p.biggestWin, amount),
      tournamentPoints: p.tournamentPoints + amount,
      jackpotPool: JACKPOT_SEED,
      stats: { ...p.stats, jackpots: (p.stats.jackpots ?? 0) + 1 },
    }));
    return amount;
  }, [commit]);

  const toggleFavorite = useCallback(
    (gameId: string) => {
      commit((p) => ({
        ...p,
        favorites: p.favorites.includes(gameId)
          ? p.favorites.filter((f) => f !== gameId)
          : [...p.favorites, gameId],
      }));
    },
    [commit],
  );

  const openGame = useCallback(
    (gameId: string) => {
      commit((p) => ({ ...p, recent: [gameId, ...p.recent.filter((r) => r !== gameId)].slice(0, 8) }));
    },
    [commit],
  );

  const spend = useCallback(
    (amount: number) => {
      if (amount <= 0 || stateRef.current.balance < amount) return false;
      commit((p) => ({ ...p, balance: p.balance - amount }));
      return true;
    },
    [commit],
  );

  const credit = useCallback(
    (amount: number) => {
      if (amount > 0) commit((p) => ({ ...p, balance: p.balance + Math.round(amount) }));
    },
    [commit],
  );

  const track = useCallback(
    (stat: string, n = 1) => {
      commit((p) => ({ ...p, stats: { ...p.stats, [stat]: (p.stats[stat] ?? 0) + n } }));
    },
    [commit],
  );

  const pendingIncome = useCallback(() => {
    const s = stateRef.current;
    const hours = Math.min(INCOME_CAP_HOURS, (Date.now() - s.incomeAt) / 3600000);
    return Math.floor(hourlyIncome(s.owned) * hours);
  }, []);

  const collectIncome = useCallback(() => {
    const amount = pendingIncome();
    commit((p) => ({ ...p, balance: p.balance + amount, incomeAt: Date.now() }));
    return amount;
  }, [commit, pendingIncome]);

  const buyItem = useCallback(
    (id: string) => {
      const item = findItem(id);
      const s = stateRef.current;
      if (!item || item.prize || s.owned.includes(id) || s.balance < item.price) return false;
      // Дохід, що вже набіг, зараховуємо до покупки, щоб новий бізнес не платив за минуле.
      const income = pendingIncome();
      commit((p) => ({
        ...p,
        balance: p.balance - item.price + income,
        owned: [...p.owned, id],
        incomeAt: Date.now(),
      }));
      return true;
    },
    [commit, pendingIncome],
  );

  const sellItem = useCallback(
    (id: string) => {
      const item = findItem(id);
      if (!item || !stateRef.current.owned.includes(id)) return 0;
      const amount = sellPrice(item);
      const income = pendingIncome();
      commit((p) => ({
        ...p,
        balance: p.balance + amount + income,
        owned: p.owned.filter((o) => o !== id),
        incomeAt: Date.now(),
      }));
      return amount;
    },
    [commit, pendingIncome],
  );

  const buyPickaxe = useCallback(
    (level: number) => {
      const pick = PICKAXES[level];
      const s = stateRef.current;
      if (!pick || level !== s.pickaxe + 1 || s.balance < pick.price) return false;
      commit((p) => ({ ...p, balance: p.balance - pick.price, pickaxe: level }));
      return true;
    },
    [commit],
  );

  const claimAchievement = useCallback(
    (id: string) => {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      const s = stateRef.current;
      if (!a || s.achievements.includes(id) || !a.done(s)) return 0;
      commit((p) => ({ ...p, balance: p.balance + a.reward, achievements: [...p.achievements, id] }));
      return a.reward;
    },
    [commit],
  );

  const placeSportBet = useCallback(
    (picks: SportPick[], stake: number) => {
      if (!picks.length || stake <= 0 || stateRef.current.balance < stake) return false;
      const odds = Math.round(picks.reduce((x, p) => x * p.odds, 1) * 100) / 100;
      const bet: SportBet = {
        id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        picks,
        stake,
        odds,
        placedAt: Date.now(),
        status: 'open',
        payout: 0,
      };
      commit((p) => ({
        ...p,
        balance: p.balance - stake,
        xp: p.xp + stake / XP_PER_KOPECKS,
        bets: p.bets + 1,
        totalBet: p.totalBet + stake,
        sportBets: [bet, ...p.sportBets].slice(0, 50),
      }));
      return true;
    },
    [commit],
  );

  // Розрахунок ставок на спорт, коли матчі завершились.
  useEffect(() => {
    if (!loaded) return;
    const settle = () => {
      const s = stateRef.current;
      if (!s.sportBets.some((b) => b.status === 'open' && betResult(b) !== 'open')) return;
      let won = 0;
      let wins = 0;
      let sportWon = 0;
      const daySport = sportOfDay().id;
      commit((p) => ({
        ...p,
        sportBets: p.sportBets.map((b) => {
          if (b.status !== 'open') return b;
          const r = betResult(b);
          if (r === 'open') return b;
          const payout = r === 'won' ? Math.floor(b.stake * b.odds) : 0;
          won += payout;
          if (payout) wins++;
          if (payout && b.picks.every((pk) => getMatch(pk.matchId).sport === daySport)) sportWon += payout;
          return { ...b, status: r, payout };
        }),
      }));
      if (won > 0) {
        commit((p) => ({
          ...p,
          balance: p.balance + won,
          totalWon: p.totalWon + won,
          biggestWin: Math.max(p.biggestWin, won),
          stats: { ...p.stats, sportWins: (p.stats.sportWins ?? 0) + wins },
          missionProgress: sportWon ? { ...p.missionProgress, sport: (p.missionProgress.sport ?? 0) + sportWon } : p.missionProgress,
        }));
        notify(`⚽ Ставка зіграла: +${formatCoins(won)}`);
      } else notify('Ставка на спорт не зіграла');
    };
    settle();
    const t = setInterval(settle, 5000);
    return () => clearInterval(t);
  }, [loaded, commit, notify]);

  const setBalance = useCallback((amount: number) => commit((p) => ({ ...p, balance: Math.max(0, Math.round(amount)) })), [commit]);

  // Промокоди перевіряє сервер, гроші приходять у серверний стан і підтягуються синхронізацією.
  const redeemPromo = useCallback(async (raw: string) => {
    const r = await redeemPromoOnServer(raw);
    syncNow.current();
    return r;
  }, []);

  // Приз без оплати. Якщо такий уже є, віддаємо його вартість грошима.
  const grantItem = useCallback(
    (id: string) => {
      const item = findItem(id);
      if (!item) return 'none' as const;
      if (stateRef.current.owned.includes(id)) {
        commit((p) => ({ ...p, balance: p.balance + item.price }));
        return 'cash' as const;
      }
      commit((p) => ({ ...p, owned: [...p.owned, id] }));
      return 'item' as const;
    },
    [commit],
  );

  const adminApply = useCallback(
    (a: AdminAction) => {
      const v = Math.max(0, Math.round(a.value ?? 0));
      if (a.applied) {
        // Сервер уже змінив стан, він прийде синхронізацією: лише сповіщаємо.
        const item = a.item ? findItem(a.item) : null;
        const text: Partial<Record<AdminAction['kind'], string>> = {
          balance_set: `🛠️ Розробник встановив баланс: ${formatCoins(v)}`,
          balance_add: `🛠️ Розробник нарахував ${formatCoins(v)}`,
          balance_take: `🛠️ Розробник забрав ${formatCoins(v)}`,
          item_give: item ? `🛠️ Розробник подарував: ${item.emoji} ${item.title}` : undefined,
          item_take: item ? `🛠️ Розробник забрав: ${item.emoji} ${item.title}` : undefined,
          level_set: `🛠️ Розробник встановив рівень ${Math.max(1, Math.min(MAX_LEVEL, v))}`,
          message: a.note ? `🛠️ ${a.note}` : undefined,
          reset: '🛠️ Розробник скинув прогрес',
        };
        if (text[a.kind]) notify(text[a.kind]!);
        syncNow.current();
        return;
      }
      switch (a.kind) {
        case 'balance_set':
          commit((p) => ({ ...p, balance: v }));
          notify(`🛠️ Розробник встановив баланс: ${formatCoins(v)}`);
          break;
        case 'balance_add':
          commit((p) => ({ ...p, balance: p.balance + v }));
          notify(`🛠️ Розробник нарахував ${formatCoins(v)}`);
          break;
        case 'balance_take':
          commit((p) => ({ ...p, balance: Math.max(0, p.balance - v) }));
          notify(`🛠️ Розробник забрав ${formatCoins(v)}`);
          break;
        case 'item_give': {
          const item = a.item ? findItem(a.item) : null;
          if (!item) break;
          commit((p) => (p.owned.includes(item.id) ? p : { ...p, owned: [...p.owned, item.id] }));
          notify(`🛠️ Розробник подарував: ${item.emoji} ${item.title}`);
          break;
        }
        case 'item_take': {
          const item = a.item ? findItem(a.item) : null;
          if (!item) break;
          commit((p) => ({ ...p, owned: p.owned.filter((x) => x !== item.id) }));
          notify(`🛠️ Розробник забрав: ${item.emoji} ${item.title}`);
          break;
        }
        case 'level_set': {
          const level = Math.max(1, Math.min(MAX_LEVEL, v));
          // Рівень ставимо напряму, без нагород за пропущені рівні.
          commit((p) => ({ ...p, xp: xpForLevel(level), level }));
          notify(`🛠️ Розробник встановив рівень ${level}`);
          break;
        }
        case 'message':
          if (a.note) notify(`🛠️ ${a.note}`);
          break;
        case 'reset': {
          const fresh = initialState();
          stateRef.current = fresh;
          setState(fresh);
          notify('🛠️ Розробник скинув прогрес');
          break;
        }
      }
    },
    [commit, notify],
  );

  const addPlate = useCallback(
    (id: string, value: number) =>
      commit((p) => ((p.plates ?? []).some((x) => x.id === id) ? p : { ...p, plates: [...(p.plates ?? []), { id, value }] })),
    [commit],
  );

  const sellPlate = useCallback(
    (id: string) => {
      const pl = (stateRef.current.plates ?? []).find((x) => x.id === id);
      if (!pl) return 0;
      commit((p) => ({
        ...p,
        balance: p.balance + pl.value,
        plates: (p.plates ?? []).filter((x) => x.id !== id),
        stats: { ...p.stats, platesSold: (p.stats.platesSold ?? 0) + 1 },
      }));
      return pl.value;
    },
    [commit],
  );

  const enterTourney = useCallback(
    (round: number) => commit((p) => ({ ...p, tourney: { round, net: 0 } })),
    [commit],
  );

  // Скидання дає стартові 300 ₴, але лише один раз на акаунт, і не обнуляє таймери бонусів.
  const reset = useCallback(() => {
    const old = stateRef.current;
    if (old.lastResetAt) return false;
    const fresh: PlayerState = {
      ...initialState(),
      lastResetAt: Date.now(),
      lastHourlyAt: old.lastHourlyAt,
      lastWheelAt: old.lastWheelAt,
      dailyStreak: old.dailyStreak,
      lastDailyDay: old.lastDailyDay,
      lastCashbackDay: old.lastCashbackDay,
      missionDay: old.missionDay,
      missionClaimed: old.missionClaimed,
      promoUsed: old.promoUsed,
    };
    stateRef.current = fresh;
    setState(fresh);
    notify(`Прогрес скинуто. Тримай ${formatCoins(START_BALANCE)}`);
    return true;
  }, [notify]);

  return (
    <WalletContext.Provider
      value={{
        state,
        loaded,
        bet,
        win,
        notify,
        claimHourly,
        claimDaily,
        claimWheel,
        claimCashback,
        claimMission,
        winJackpot,
        toggleFavorite,
        spend,
        credit,
        track,
        buyItem,
        sellItem,
        pendingIncome,
        collectIncome,
        buyPickaxe,
        claimAchievement,
        placeSportBet,
        redeemPromo,
        setBalance,
        enterTourney,
        grantItem,
        adminApply,
        addPlate,
        sellPlate,
        banned,
        openGame,
        reset,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletApi {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}
