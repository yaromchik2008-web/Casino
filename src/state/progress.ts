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

// Рівні від 1 до 100; назва змінюється кожні 10 рівнів.
export const MAX_LEVEL = 100;

export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

export function levelName(level: number): string {
  return LEVELS[Math.min(LEVELS.length, Math.ceil(Math.min(level, MAX_LEVEL) / 10)) - 1];
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
  hard?: boolean;
}

// Вид спорту для важкого завдання дня змінюється щодня.
export const DAILY_SPORTS: { id: string; label: string }[] = [
  { id: 'football', label: 'футбол' },
  { id: 'basketball', label: 'баскетбол' },
  { id: 'tennis', label: 'теніс' },
  { id: 'hockey', label: 'хокей' },
];

export function sportOfDay(date = new Date()) {
  const n = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000);
  return DAILY_SPORTS[((n % DAILY_SPORTS.length) + DAILY_SPORTS.length) % DAILY_SPORTS.length];
}

// 5 легких завдань по 50 ₴ і 3 важких по 100 ₴.
export function dailyMissions(date = new Date()): MissionDef[] {
  const sport = sportOfDay(date);
  return [
    { id: 'bets', title: 'Зроби 20 ставок у будь-яких іграх', goal: 20, reward: 5000, icon: '🎯' },
    { id: 'slot', title: 'Зіграй 15 обертів у слотах', goal: 15, reward: 5000, icon: '🎰' },
    { id: 'table', title: 'Зіграй 3 настільні ігри', goal: 3, reward: 5000, icon: '🃏' },
    { id: 'fast', title: 'Зіграй 5 швидких ігор', goal: 5, reward: 5000, icon: '⚡' },
    { id: 'variety', title: 'Спробуй 3 різні ігри', goal: 3, reward: 5000, icon: '🧭' },
    { id: 'sport', title: `Виграй 200 ₴ на ставках: ${sport.label}`, goal: 20000, reward: 10000, icon: '🏟️', hard: true },
    { id: 'bigwin', title: 'Виграй 100 ₴+ за одну гру', goal: 1, reward: 10000, icon: '🏆', hard: true },
    { id: 'grind', title: 'Зроби 150 ставок за день', goal: 150, reward: 10000, icon: '🔥', hard: true },
  ];
}

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
