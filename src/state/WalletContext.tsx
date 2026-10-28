import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  GameGroup,
  MISSIONS,
  TOURNAMENT_PRIZES,
  dayId,
  leaderboard,
  levelFromXp,
  levelName,
  levelReward,
  weekId,
  XP_PER_KOPECKS,
} from './progress';
import { formatCoins } from '../theme';
import { ACHIEVEMENTS } from './achievements';
import { INCOME_CAP_HOURS, findItem, hourlyIncome, sellPrice } from './shop';
import { SportBet, SportPick, betResult } from './sports';
import { tourneyRound } from './friends';
import { PICKAXES } from '../games/mineEngine';

const KEY = 'freecasino:player:v3';

export const START_BALANCE = 50000; // усі суми в копійках: 50000 = 500,00 ₴
export const HOURLY_BONUS = 500;
export const HOURLY_COOLDOWN_MS = 60 * 60 * 1000;
export const WHEEL_COOLDOWN_MS = 4 * 60 * 60 * 1000;
export const DAILY_REWARDS = [1000, 1500, 2000, 3000, 4000, 5000, 10000];
export const JACKPOT_SEED = 100000;
// Промокоди в копійках. Одноразові, крім тих, що в REUSABLE_PROMOS (за бажанням ghj усі поточні багаторазові).
const PROMO_CODES: Record<string, number> = { sosunok: 100000, salo: 1000000 };
const REUSABLE_PROMOS = ['sosunok', 'salo', 'ben'];
// Жартівливі коди, що обнуляють баланс (за бажанням ghj).
const RESET_PROMOS = ['ben'];
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
  // Турнір на 6 годин: в якому раунді граю і скільки заробив (виграші мінус ставки).
  tourney?: { round: number; net: number };
  xpV: number;
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
  const week = weekId();
  if (next.tournamentWeek !== week) {
    const rows = leaderboard(next.tournamentWeek, next.tournamentPoints, 1);
    const place = rows.findIndex((r) => r.me);
    const prize = next.tournamentPoints > 0 ? TOURNAMENT_PRIZES[place] ?? 0 : 0;
    if (prize > 0) notes.push(`Турнір завершено: ${place + 1} місце, приз ${formatCoins(prize)}`);
    next = {
      ...next,
      balance: next.balance + prize,
      tournamentWeek: week,
      tournamentPoints: 0,
    };
  }
  return next;
}

interface WalletApi {
  state: PlayerState;
  loaded: boolean;
  toast: string | null;
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
  redeemPromo: (code: string) => number | 'used' | 'invalid' | 'reset';
  enterTourney: (round: number) => void;
  grantItem: (id: string) => 'item' | 'cash' | 'none';
  openGame: (gameId: string) => void;
  reset: () => void;
}

const WalletContext = createContext<WalletApi | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerState>(initialState);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const stateRef = useRef(state);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

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
          const restored = rollPeriods({ ...initialState(), ...saved, xpV: 2 }, notes);
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

  const bet = useCallback(
    (gameId: string, group: GameGroup, amount: number) => {
      if (amount <= 0 || stateRef.current.balance < amount) return false;
      commit((s) => {
        const progress = { ...s.missionProgress };
        progress.bets = (progress.bets ?? 0) + 1;
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
    (_gameId: string, amount: number) => {
      if (amount <= 0) return;
      const rounded = Math.round(amount);
      commit((s) => ({
        ...s,
        balance: s.balance + rounded,
        totalWon: s.totalWon + rounded,
        biggestWin: Math.max(s.biggestWin, rounded),
        lossSinceCashback: Math.max(0, s.lossSinceCashback - rounded),
        tournamentPoints: s.tournamentPoints + rounded,
        tourney: s.tourney && s.tourney.round === tourneyRound() ? { ...s.tourney, net: s.tourney.net + rounded } : s.tourney,
        missionProgress:
          rounded >= 1000 ? { ...s.missionProgress, bigwin: 1 } : s.missionProgress,
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
      const mission = MISSIONS.find((m) => m.id === id);
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
      commit((p) => ({
        ...p,
        sportBets: p.sportBets.map((b) => {
          if (b.status !== 'open') return b;
          const r = betResult(b);
          if (r === 'open') return b;
          const payout = r === 'won' ? Math.floor(b.stake * b.odds) : 0;
          won += payout;
          if (payout) wins++;
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
        }));
        notify(`⚽ Ставка зіграла: +${formatCoins(won)}`);
      } else notify('Ставка на спорт не зіграла');
    };
    settle();
    const t = setInterval(settle, 5000);
    return () => clearInterval(t);
  }, [loaded, commit, notify]);

  const redeemPromo = useCallback(
    (raw: string) => {
      const code = raw.trim().toLowerCase();
      if (RESET_PROMOS.includes(code)) {
        commit((p) => ({ ...p, balance: 0 }));
        return 'reset' as const;
      }
      const amount = PROMO_CODES[code];
      if (!amount) return 'invalid' as const;
      if (!REUSABLE_PROMOS.includes(code) && stateRef.current.promoUsed.includes(code)) return 'used' as const;
      commit((p) => ({
        ...p,
        balance: p.balance + amount,
        promoUsed: p.promoUsed.includes(code) ? p.promoUsed : [...p.promoUsed, code],
      }));
      return amount;
    },
    [commit],
  );

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

  const enterTourney = useCallback(
    (round: number) => commit((p) => ({ ...p, tourney: { round, net: 0 } })),
    [commit],
  );

  const reset = useCallback(() => {
    const fresh = initialState();
    stateRef.current = fresh;
    setState(fresh);
    notify(`Прогрес скинуто. Тримай ${formatCoins(START_BALANCE)}`);
  }, [notify]);

  return (
    <WalletContext.Provider
      value={{
        state,
        loaded,
        toast,
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
        enterTourney,
        grantItem,
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
