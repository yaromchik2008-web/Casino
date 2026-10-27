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
} from './progress';

const KEY = 'freecasino:player:v2';

export const START_BALANCE = 5000;
export const HOURLY_BONUS = 500;
export const HOURLY_COOLDOWN_MS = 60 * 60 * 1000;
export const WHEEL_COOLDOWN_MS = 4 * 60 * 60 * 1000;
export const DAILY_REWARDS = [1000, 1500, 2000, 3000, 4000, 5000, 10000];
export const JACKPOT_SEED = 100000;

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
    if (prize > 0) notes.push(`Турнір завершено: ${place + 1} місце, приз ${prize} 🪙`);
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
        notes.push(`Новий рівень: ${levelName(level)}! +${reward} 🪙`);
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
          const restored = rollPeriods({ ...initialState(), ...JSON.parse(raw) }, notes);
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
          xp: s.xp + amount,
          bets: s.bets + 1,
          totalBet: s.totalBet + amount,
          played: { ...s.played, [gameId]: (s.played[gameId] ?? 0) + 1 },
          jackpotPool: s.jackpotPool + Math.ceil(amount * 0.02),
          lossSinceCashback: s.lossSinceCashback + amount,
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
    const amount = Math.floor(s.lossSinceCashback * 0.1);
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

  const reset = useCallback(() => {
    const fresh = initialState();
    stateRef.current = fresh;
    setState(fresh);
    notify('Прогрес скинуто. Тримай 5000 🪙');
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
