// Чисті функції прогресу гравця: рівні, завдання, турнір.

export const LEVELS = [
  'Новачок',
  'Гравець',
  'Бронза',
  'Срібло',
  'Золото',
  'Платина',
  'Діамант',
  'Майстер',
  'Легенда',
  'Космічна легенда',
];

// 1 XP за кожні 10 копійок ставки. Рівень 2 ≈ 100 ₴ ставок, рівень 5 ≈ 1 400 ₴, рівень 10 ≈ 6 500 ₴.
export const XP_PER_KOPECKS = 10;

export function xpForLevel(level: number): number {
  return Math.round(1000 * Math.pow(level - 1, 1.9));
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < LEVELS.length && xp >= xpForLevel(level + 1)) level++;
  return level;
}

export function levelName(level: number): string {
  return LEVELS[Math.min(level, LEVELS.length) - 1];
}

export function levelReward(level: number): number {
  return 1000 * level;
}

export type GameGroup = 'slot' | 'table' | 'fast';

export interface MissionDef {
  id: string;
  title: string;
  goal: number;
  reward: number;
  icon: string;
}

export const MISSIONS: MissionDef[] = [
  { id: 'bets', title: 'Зроби 30 ставок у будь-яких іграх', goal: 30, reward: 500, icon: '🎯' },
  { id: 'slot', title: 'Зіграй 20 обертів у слотах', goal: 20, reward: 400, icon: '🎰' },
  { id: 'table', title: 'Зіграй 5 настільних ігор', goal: 5, reward: 400, icon: '🃏' },
  { id: 'fast', title: 'Зіграй 10 швидких ігор', goal: 10, reward: 400, icon: '⚡' },
  { id: 'bigwin', title: 'Виграй 10 ₴+ за одну гру', goal: 1, reward: 1000, icon: '🏆' },
  { id: 'variety', title: 'Спробуй 5 різних ігор', goal: 5, reward: 700, icon: '🧭' },
];

export function dayId(date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function weekId(date = new Date()): string {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return dayId(monday);
}

export function weekProgress(date = new Date()): number {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Math.min(1, (date.getTime() - monday.getTime()) / (7 * 24 * 3600 * 1000));
}

export function weekEndsAt(date = new Date()): number {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + 7);
  return monday.getTime();
}

const BOT_NAMES = [
  'Зірковий_Лис', 'Комета77', 'Удачливий_Кіт', 'МісяцьНаДні', 'Ракетник', 'Сатурн_UA',
  'Фортуна', 'ДжекпотМен', 'Нічна_Сова', 'Галактика', 'Шериф_Бо', 'Золота_Рибка',
  'Пірат_Джек', 'Вікінг', 'Метеор', 'Туманність', 'Дракоша', 'Орбіта',
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface LeaderRow {
  name: string;
  points: number;
  me?: boolean;
}

// Суперники-боти з передбачуваними очками, що ростуть протягом тижня.
export function leaderboard(week: string, myPoints: number, progress: number): LeaderRow[] {
  const bots = BOT_NAMES.map((name) => {
    const h = hash(week + name);
    const finalPoints = 5000 + (h % 150000);
    return { name, points: Math.round(finalPoints * progress) };
  });
  return [...bots, { name: 'Ти', points: myPoints, me: true }].sort((a, b) => b.points - a.points);
}

export const TOURNAMENT_PRIZES = [50000, 25000, 15000, 10000, 7500, 5000, 4000, 3000, 2000, 1000];
