import type { MusicId } from '../audio/assets';
import { SlotConfig, classicSymbols, videoSymbols } from './slotEngine';
import { TumbleConfig, tumbleSymbols } from './tumbleEngine';

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
  | 'coin'
  | 'tumble'
  | 'holdwin'
  | 'dig';

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
  tumble?: TumbleConfig;
  music: MusicId;
  description: string;
}

function classic(emojis: string[], jackpot = false): SlotConfig {
  const symbols = classicSymbols(emojis);
  return { reels: 3, symbols, jackpotSymbol: jackpot ? symbols[symbols.length - 1].id : undefined };
}

function video(emojis: string[], wild: string, scatter: string): SlotConfig {
  return { reels: 5, symbols: videoSymbols(emojis, wild, scatter), wild: 'wild', scatter: 'scatter' };
}

// Основна гра «Утримай і виграй»: без скатерів, бонус запускають монети (RTP ≈ 0.91, див. holdwinEngine).
function holdwin(emojis: string[], wild: string): SlotConfig {
  const symbols = videoSymbols(emojis, wild, '')
    .filter((x) => x.id !== 'scatter')
    .map((x) => ({ ...x, pays: x.pays.map((p) => Math.round(p * 0.8 * 10) / 10) }));
  return { reels: 5, symbols, wild: 'wild' };
}

// Каскадні слоти: виплати й вага бомб підібрані симуляцією (RTP ≈ 0.88–0.92).
function tumble(emojis: string[], scatter: string, scale: number, baseBombs: number, freeBombs: number, buyCost: number): TumbleConfig {
  return {
    symbols: tumbleSymbols(emojis, scale),
    scatter: { emoji: scatter, weight: 2, weightFree: 2 },
    bomb: { emoji: '💣', weightBase: baseBombs, weightFree: freeBombs },
    freeSpins: 10,
    retrigger: 5,
    buyCost,
  };
}

export const GAMES: GameInfo[] = [
  {
    id: 'fruit-classic',
    music: 'classic',
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
    music: 'classic',
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
    music: 'jackpot',
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
    music: 'jackpot',
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
    music: 'egypt',
    title: 'Скарби фараона',
    emoji: '🏺',
    colors: ['#D97706', '#451A03'],
    kind: 'holdwin',
    categories: ['special', 'slots', 'popular', 'jackpot'],
    tag: 'HOT',
    slot: holdwin(['🪲', '🐍', '🐫', '🏺', '👁️', '🗿'], '☀️'),
    description: '6+ монет запускають «Утримай і виграй»: 3 оберти, нові ряди, джекпоти Міні, Мінор, Мажор і Гранд.',
  },
  {
    id: 'space',
    music: 'space',
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
    music: 'ocean',
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
    music: 'candy',
    title: 'Цукрова країна',
    emoji: '🍭',
    colors: ['#EC4899', '#831843'],
    kind: 'tumble',
    categories: ['special', 'slots', 'popular'],
    tag: 'HOT',
    tumble: tumble(['🍬', '🍪', '🍩', '🧁', '🍫', '🍰', '🍦', '🎂', '💗'], '🍭', 1.38, 0.13, 7, 70),
    description: '8+ однакових будь-де виграють і лопаються. 4+ 🍭 дають 10 фриспінів, 💣 множать виграш до ×100.',
  },
  {
    id: 'fruit-avalanche',
    music: 'fruit',
    title: 'Фруктова лавина',
    emoji: '🍉',
    colors: ['#22C55E', '#14532D'],
    kind: 'tumble',
    categories: ['special', 'slots', 'new', 'popular'],
    tag: 'NEW',
    tumble: tumble(['🫐', '🍋', '🍏', '🍑', '🍇', '🍉', '🍓', '🍒', '❤️'], '⭐', 1.7, 0, 9, 90),
    description: 'Каскади фруктів: 8+ однакових будь-де. 4+ ⭐ дають 10 фриспінів з бомбами-множниками.',
  },
  {
    id: 'wild-west',
    music: 'western',
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
    music: 'pirates',
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
    music: 'dragon',
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
    music: 'forest',
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
    music: 'vikings',
    title: 'Сага вікінгів',
    emoji: '🛡️',
    colors: ['#64748B', '#1E293B'],
    kind: 'slot',
    categories: ['special', 'slots'],
    slot: video(['🪓', '🛡️', '🐺', '⛵', '🍺', '👑'], '⚡', '🔮'),
    description: 'Похід за золотом. ⚡ замінює символи, 3+ 🔮 дають фриспіни.',
  },
  {
    id: 'shakhta',
    music: 'mine',
    title: 'Шахта',
    emoji: '⛏️',
    colors: ['#78716C', '#1C1917'],
    kind: 'dig',
    categories: ['fast', 'new', 'popular'],
    tag: 'NEW',
    description: 'Розбивай блоки киркою, шукай золото, діаманти і скрині. Динаміт підриває все навколо.',
  },
  {
    id: 'crash',
    music: 'lobby',
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
    music: 'lobby',
    title: 'Міни',
    emoji: '💣',
    colors: ['#0D9488', '#134E4A'],
    kind: 'mines',
    categories: ['fast', 'popular'],
    description: 'Відкривай клітинки з діамантами і не натрап на міну.',
  },
  {
    id: 'plinko',
    music: 'lobby',
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
    music: 'lobby',
    title: 'Кості',
    emoji: '🎲',
    colors: ['#2563EB', '#172554'],
    kind: 'dice',
    categories: ['fast'],
    description: 'Вгадай, чи випаде число більше або менше за обране.',
  },
  {
    id: 'coin',
    music: 'lobby',
    title: 'Монетка',
    emoji: '🪙',
    colors: ['#CA8A04', '#422006'],
    kind: 'coin',
    categories: ['fast'],
    description: 'Орел чи решка? Виграш ×1.88.',
  },
  {
    id: 'wheel',
    music: 'lobby',
    title: 'Колесо удачі',
    emoji: '🎡',
    colors: ['#F43F5E', '#4C0519'],
    kind: 'wheel',
    categories: ['fast', 'popular'],
    description: 'Крути колесо і забирай множник до ×50.',
  },
  {
    id: 'roulette',
    music: 'lobby',
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
    music: 'lobby',
    title: 'Блекджек',
    emoji: '🂡',
    colors: ['#1D4ED8', '#0B1B4D'],
    kind: 'blackjack',
    categories: ['table', 'popular'],
    description: 'Набери 21 або більше за дилера, але не перебери.',
  },
  {
    id: 'baccarat',
    music: 'lobby',
    title: 'Баккара',
    emoji: '🎴',
    colors: ['#9333EA', '#3B0764'],
    kind: 'baccarat',
    categories: ['table'],
    description: 'Гравець, Банкір чи Нічия? Ставка за секунду.',
  },
  {
    id: 'poker',
    music: 'lobby',
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
    music: 'lobby',
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
  if (kind === 'slot' || kind === 'tumble' || kind === 'holdwin') return 'slot';
  if (['roulette', 'blackjack', 'baccarat', 'poker', 'hilo'].includes(kind)) return 'table';
  return 'fast';
}
