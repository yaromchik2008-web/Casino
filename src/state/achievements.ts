import type { PlayerState } from './WalletContext';
import { STATUSES, assetsValue, findItem } from './shop';

const UAH = 100;

export interface Achievement {
  id: string;
  title: string;
  icon: string;
  reward: number;
  done: (s: PlayerState) => boolean;
}

const owns = (s: PlayerState, cat: string) => s.owned.some((id) => findItem(id)?.category === cat);

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'bets10', title: 'Перші 10 ставок', icon: '🎯', reward: 5 * UAH, done: (s) => s.bets >= 10 },
  { id: 'bets100', title: '100 ставок', icon: '💯', reward: 20 * UAH, done: (s) => s.bets >= 100 },
  { id: 'bets1000', title: '1000 ставок', icon: '🏅', reward: 100 * UAH, done: (s) => s.bets >= 1000 },
  { id: 'bonus', title: 'Перший бонусний раунд', icon: '🎁', reward: 10 * UAH, done: (s) => (s.stats.bonuses ?? 0) >= 1 },
  { id: 'bigwin', title: 'Виграш 100 ₴ за раз', icon: '💥', reward: 25 * UAH, done: (s) => s.biggestWin >= 100 * UAH },
  { id: 'jackpot', title: 'Перший джекпот', icon: '💰', reward: 50 * UAH, done: (s) => (s.stats.jackpots ?? 0) >= 1 },
  { id: 'level5', title: 'Рівень 5', icon: '⭐', reward: 50 * UAH, done: (s) => s.level >= 5 },
  { id: 'item', title: 'Перша покупка', icon: '🛍️', reward: 10 * UAH, done: (s) => s.owned.length >= 1 },
  { id: 'car', title: 'Свій транспорт', icon: '🚗', reward: 30 * UAH, done: (s) => owns(s, 'car') },
  { id: 'home', title: 'Своє житло', icon: '🏠', reward: 50 * UAH, done: (s) => owns(s, 'home') },
  { id: 'biz', title: 'Власний бізнес', icon: '🏢', reward: 50 * UAH, done: (s) => owns(s, 'business') },
  { id: 'sport', title: 'Виграна ставка на спорт', icon: '⚽', reward: 15 * UAH, done: (s) => (s.stats.sportWins ?? 0) >= 1 },
  { id: 'diamond', title: 'Діамант у шахті', icon: '💎', reward: 15 * UAH, done: (s) => (s.stats.diamonds ?? 0) >= 1 },
  {
    id: 'millionaire',
    title: 'Статус «Мільйонер»',
    icon: '👑',
    reward: 1000 * UAH,
    done: (s) => s.balance + assetsValue(s.owned) >= STATUSES.find((x) => x.title === 'Мільйонер')!.min,
  },
];
