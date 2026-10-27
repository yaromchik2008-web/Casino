import { SlotConfig, classicSymbols, videoSymbols } from './slotEngine';

export type GameKind =
  | 'slot'
  | 'roulette'
  | 'blackjack'
  | 'baccarat'
  | 'poker'
  | 'crash'
  | 'mines'
  | 'plinko'
  | 'dice'
  | 'hilo'
  | 'wheel'
  | 'coin';

export type Category = 'popular' | 'new' | 'slots' | 'special' | 'jackpot' | 'fast' | 'table';

export const CATEGORIES: { id: Category | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'Усі', icon: '🎮' },
  { id: 'popular', label: 'Популярні', icon: '🔥' },
  { id: 'new', label: 'Нові', icon: '✨' },
  { id: 'slots', label: 'Слоти', icon: '🎰' },
  { id: 'special', label: 'Особливі', icon: '💫' },
  { id: 'jackpot', label: 'Джекпоти', icon: '💰' },
  { id: 'fast', label: 'Швидкі', icon: '⚡' },
  { id: 'table', label: 'Настільні', icon: '🃏' },
];

export interface GameInfo {
  id: string;
  title: string;
  emoji: string;
  colors: readonly [string, string];
  kind: GameKind;
  categories: Category[];
  tag?: 'HOT' | 'NEW' | 'JP';
  slot?: SlotConfig;
  description: string;
}

function classic(emojis: string[], jackpot = false): SlotConfig {
  const symbols = classicSymbols(emojis);
  return { reels: 3, symbols, jackpotSymbol: jackpot ? symbols[symbols.length - 1].id : undefined };
}

function video(emojis: string[], wild: string, scatter: string): SlotConfig {
  return { reels: 5, symbols: videoSymbols(emojis, wild, scatter), wild: 'wild', scatter: 'scatter' };
}

export const GAMES: GameInfo[] = [
  {
    id: 'fruit-classic',
    title: 'Фруктова класика',
    emoji: '🍒',
    colors: ['#E11D48', '#7C1D3A'],
    kind: 'slot',
    categories: ['popular', 'slots'],
    tag: 'HOT',
    slot: classic(['🍒', '🍋', '🍊', '🍉', '🍇', '🔔', '7️⃣']),
    description: '3 барабани, 5 ліній. Класика, з якої все почалося.',
  },
  {
    id: 'hot-sevens',
    title: 'Гарячі сімки',
    emoji: '7️⃣',
    colors: ['#F97316', '#9A3412'],
    kind: 'slot',
    categories: ['slots', 'popular'],
    slot: classic(['🍒', '🍋', '🍑', '🍀', '🔔', '💎', '7️⃣']),
    description: 'Збери три сімки і забери ×300 за лінію.',
  },
  {
    id: 'diamond-jackpot',
    title: 'Діамантовий джекпот',
    emoji: '💎',
    colors: ['#06B6D4', '#1E3A8A'],
    kind: 'slot',
    categories: ['jackpot', 'slots'],
    tag: 'JP',
    slot: classic(['🍒', '🍋', '🍊', '🔔', '⭐', '👑', '💎'], true),
    description: 'Три 💎 на центральній лінії забирають прогресивний джекпот.',
  },
  {
    id: 'gold-jackpot',
    title: 'Золотий трон',
    emoji: '👑',
    colors: ['#EAB308', '#713F12'],
    kind: 'slot',
    categories: ['jackpot', 'slots', 'new'],
    tag: 'JP',
    slot: classic(['🍇', '🍉', '🍋', '🔔', '💰', '💎', '👑'], true),
    description: 'Три 👑 на центральній лінії приносять джекпот.',
  },
  {
    id: 'pharaoh',
    title: 'Скарби фараона',
    emoji: '🏺',
    colors: ['#D97706', '#451A03'],
    kind: 'slot',
    categories: ['special', 'slots', 'popular'],
    tag: 'HOT',
    slot: video(['🪲', '🐍', '🐫', '🏺', '👁️', '🗿'], '☀️', '📜'),
    description: '5 барабанів, 10 ліній. ☀️ замінює символи, 3+ 📜 дають фриспіни.',
  },
  {
    id: 'space',
    title: 'Космічна одіссея',
    emoji: '🚀',
    colors: ['#7C3AED', '#1E1B4B'],
    kind: 'slot',
    categories: ['special', 'slots', 'new'],
    tag: 'NEW',
    slot: video(['☄️', '🛰️', '🪐', '👽', '🚀', '🌌'], '⭐', '🛸'),
    description: 'Політ серед зірок. ⭐ замінює символи, 3+ 🛸 дають фриспіни.',
  },
  {
    id: 'ocean',
    title: 'Глибини океану',
    emoji: '🐙',
    colors: ['#0EA5E9', '#0C4A6E'],
    kind: 'slot',
    categories: ['special', 'slots'],
    slot: video(['🐚', '🐠', '🦀', '🐙', '🦈', '🧜'], '🔱', '🫧'),
    description: 'Підводні скарби. 🔱 замінює символи, 3+ 🫧 дають фриспіни.',
  },
  {
    id: 'candy',
    title: 'Цукрова країна',
    emoji: '🍭',
    colors: ['#EC4899', '#831843'],
    kind: 'slot',
    categories: ['special', 'slots', 'popular'],
    slot: video(['🍬', '🍪', '🍩', '🧁', '🍫', '🎂'], '🍭', '🎁'),
    description: 'Солодкі виграші. 🍭 замінює символи, 3+ 🎁 дають фриспіни.',
  },
  {
    id: 'wild-west',
    title: 'Дикий Захід',
    emoji: '🤠',
    colors: ['#B45309', '#3F1D0B'],
    kind: 'slot',
    categories: ['special', 'slots'],
    slot: video(['🌵', '🐎', '🥾', '🎩', '💰', '🤠'], '⭐', '🗺️'),
    description: 'Шериф шукає скарби. ⭐ замінює символи, 3+ 🗺️ дають фриспіни.',
  },
  {
    id: 'pirates',
    title: 'Острів піратів',
    emoji: '🏴‍☠️',
    colors: ['#334155', '#0F172A'],
    kind: 'slot',
    categories: ['special', 'slots', 'new'],
    tag: 'NEW',
    slot: video(['⚓', '🦜', '🧭', '🗡️', '💰', '🏴‍☠️'], '☠️', '🗺️'),
    description: 'На абордаж! ☠️ замінює символи, 3+ 🗺️ дають фриспіни.',
  },
  {
    id: 'dragon',
    title: 'Лігво дракона',
    emoji: '🐉',
    colors: ['#DC2626', '#450A0A'],
    kind: 'slot',
    categories: ['special', 'slots', 'popular'],
    slot: video(['🏮', '🧧', '🪭', '🏯', '🔥', '🐉'], '🪙', '🥮'),
    description: 'Вогняні виграші. 🪙 замінює символи, 3+ 🥮 дають фриспіни.',
  },
  {
    id: 'forest',
    title: 'Казковий ліс',
    emoji: '🍄',
    colors: ['#16A34A', '#052E16'],
    kind: 'slot',
    categories: ['special', 'slots'],
    slot: video(['🌰', '🍄', '🦔', '🦉', '🦊', '🧚'], '🌳', '🌙'),
    description: 'Магія лісу. 🌳 замінює символи, 3+ 🌙 дають фриспіни.',
  },
  {
    id: 'vikings',
    title: 'Сага вікінгів',
    emoji: '🛡️',
    colors: ['#64748B', '#1E293B'],
    kind: 'slot',
    categories: ['special', 'slots'],
    slot: video(['🪓', '🛡️', '🐺', '⛵', '🍺', '👑'], '⚡', '🔮'),
    description: 'Похід за золотом. ⚡ замінює символи, 3+ 🔮 дають фриспіни.',
  },
  {
    id: 'crash',
    title: 'Ракета',
    emoji: '📈',
    colors: ['#8B5CF6', '#312E81'],
    kind: 'crash',
    categories: ['fast', 'popular', 'new'],
    tag: 'HOT',
    description: 'Множник росте, поки ракета летить. Забери виграш до вибуху!',
  },
  {
    id: 'mines',
    title: 'Міни',
    emoji: '💣',
    colors: ['#0D9488', '#134E4A'],
    kind: 'mines',
    categories: ['fast', 'popular'],
    description: 'Відкривай клітинки з діамантами і не натрап на міну.',
  },
  {
    id: 'plinko',
    title: 'Плінко',
    emoji: '🔴',
    colors: ['#DB2777', '#4A044E'],
    kind: 'plinko',
    categories: ['fast', 'new'],
    tag: 'NEW',
    description: 'Кулька падає крізь кілочки у кошики з множниками.',
  },
  {
    id: 'dice',
    title: 'Кості',
    emoji: '🎲',
    colors: ['#2563EB', '#172554'],
    kind: 'dice',
    categories: ['fast'],
    description: 'Вгадай, чи випаде число більше або менше за обране.',
  },
  {
    id: 'coin',
    title: 'Монетка',
    emoji: '🪙',
    colors: ['#CA8A04', '#422006'],
    kind: 'coin',
    categories: ['fast'],
    description: 'Орел чи решка? Виграш ×1.95.',
  },
  {
    id: 'wheel',
    title: 'Колесо удачі',
    emoji: '🎡',
    colors: ['#F43F5E', '#4C0519'],
    kind: 'wheel',
    categories: ['fast', 'popular'],
    description: 'Крути колесо і забирай множник до ×50.',
  },
  {
    id: 'roulette',
    title: 'Європейська рулетка',
    emoji: '🎯',
    colors: ['#15803D', '#052E16'],
    kind: 'roulette',
    categories: ['table', 'popular'],
    tag: 'HOT',
    description: 'Одне зеро, ставки на числа, кольори, дюжини.',
  },
  {
    id: 'blackjack',
    title: 'Блекджек',
    emoji: '🂡',
    colors: ['#1D4ED8', '#0B1B4D'],
    kind: 'blackjack',
    categories: ['table', 'popular'],
    description: 'Набери 21 або більше за дилера, але не перебери.',
  },
  {
    id: 'baccarat',
    title: 'Баккара',
    emoji: '🎴',
    colors: ['#9333EA', '#3B0764'],
    kind: 'baccarat',
    categories: ['table'],
    description: 'Гравець, Банкір чи Нічия? Ставка за секунду.',
  },
  {
    id: 'poker',
    title: 'Відеопокер',
    emoji: '🃏',
    colors: ['#BE123C', '#3F0716'],
    kind: 'poker',
    categories: ['table', 'new'],
    tag: 'NEW',
    description: 'Jacks or Better: тримай найкращі карти і збирай комбінації.',
  },
  {
    id: 'hilo',
    title: 'Більше чи менше',
    emoji: '🔼',
    colors: ['#0891B2', '#083344'],
    kind: 'hilo',
    categories: ['table', 'fast'],
    description: 'Наступна карта буде старша чи молодша? Множ виграш серіями.',
  },
];

export function findGame(id: string): GameInfo | undefined {
  return GAMES.find((g) => g.id === id);
}

export function groupOf(kind: GameKind): 'slot' | 'table' | 'fast' {
  if (kind === 'slot') return 'slot';
  if (['roulette', 'blackjack', 'baccarat', 'poker', 'hilo'].includes(kind)) return 'table';
  return 'fast';
}
