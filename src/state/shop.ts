// Майно за ігрові гривні. Суми в копійках. Назви загальні, без брендів.

export type ItemCategory = 'car' | 'home' | 'business';

export interface ShopItem {
  id: string;
  title: string;
  emoji: string;
  category: ItemCategory;
  price: number;
  income?: number; // за годину
  prize?: boolean; // не продається в магазині, лише виграш; продається за повну ціну
}

const UAH = 100;

// Телефони прибрали з магазину (за бажанням ghj). Куплені повертаються грошима за повну ціну.
export const REMOVED_ITEMS: Record<string, number> = {
  'phone-basic': 50 * UAH,
  'phone-smart': 500 * UAH,
  'phone-pro': 2500 * UAH,
  'phone-fold': 6000 * UAH,
};

export const SHOP_CATEGORIES: { id: ItemCategory; label: string; icon: string }[] = [
  { id: 'home', label: 'Житло', icon: '🏠' },
  { id: 'car', label: 'Транспорт', icon: '🚗' },
  { id: 'business', label: 'Бізнес', icon: '🏢' },
];

export const SHOP_ITEMS: ShopItem[] = [

  { id: 'car-bike', title: 'Велосипед', emoji: '🚲', category: 'car', price: 300 * UAH },
  { id: 'car-scooter', title: 'Скутер', emoji: '🛵', category: 'car', price: 1500 * UAH },
  { id: 'moto-alpha', title: 'Мопед Альфа 110 кубів', emoji: '🛵', category: 'car', price: 18000 * UAH },
  { id: 'moto-prus', title: 'Прус', emoji: '🏍️', category: 'car', price: 25000 * UAH },
  { id: 'moto-forte', title: 'Forte 200 кубів', emoji: '🏍️', category: 'car', price: 42000 * UAH },
  { id: 'car-old', title: 'Вживана легківка', emoji: '🚗', category: 'car', price: 8000 * UAH },
  { id: 'car-vaz', title: 'ВАЗ 2107', emoji: '🚗', category: 'car', price: 35000 * UAH },
  { id: 'car-doblo', title: 'Fiat Doblo', emoji: '🚐', category: 'car', price: 220000 * UAH },
  { id: 'car-megane', title: 'Renault Megane', emoji: '🚘', category: 'car', price: 280000 * UAH },
  { id: 'car-suv', title: 'Кросовер', emoji: '🚙', category: 'car', price: 450000 * UAH },
  { id: 'car-sport', title: 'Спорткар', emoji: '🏎️', category: 'car', price: 1500000 * UAH },
  // Мегаприз бонусу «Золотого Карася». Ціна як у вживаного на ринку України (≈ $21 тис.).
  { id: 'prize-sprinter', title: 'Mercedes Sprinter 3.0', emoji: '🚐', category: 'car', price: 900000 * UAH, prize: true },
  { id: 'car-yacht', title: 'Яхта', emoji: '🛥️', category: 'car', price: 3000000 * UAH },

  { id: 'home-room', title: 'Кімната в гуртожитку', emoji: '🛏️', category: 'home', price: 1000 * UAH, income: 5 * UAH },
  { id: 'home-flat', title: 'Квартира', emoji: '🏢', category: 'home', price: 20000 * UAH, income: 15 * UAH },
  { id: 'home-house', title: 'Будинок', emoji: '🏡', category: 'home', price: 80000 * UAH, income: 50 * UAH },
  { id: 'home-pent', title: 'Пентхаус', emoji: '🌆', category: 'home', price: 250000 * UAH, income: 200 * UAH },
  { id: 'home-villa', title: 'Вілла біля моря', emoji: '🏝️', category: 'home', price: 600000 * UAH, income: 300 * UAH },
  { id: 'home-castle', title: 'Замок', emoji: '🏰', category: 'home', price: 2000000 * UAH, income: 500 * UAH },

  { id: 'biz-coffee', title: 'Кавовий кіоск', emoji: '☕', category: 'business', price: 2000 * UAH, income: 10 * UAH },
  { id: 'biz-bakery', title: 'Пекарня', emoji: '🥐', category: 'business', price: 10000 * UAH, income: 45 * UAH },
  { id: 'biz-garage', title: 'Автосервіс', emoji: '🔧', category: 'business', price: 40000 * UAH, income: 160 * UAH },
  { id: 'biz-rest', title: 'Ресторан', emoji: '🍽️', category: 'business', price: 120000 * UAH, income: 450 * UAH },
  { id: 'biz-it', title: 'Ковбасня', emoji: '🌭', category: 'business', price: 400000 * UAH, income: 1400 * UAH },
  { id: 'biz-factory', title: 'Майонезний завод', emoji: '🏭', category: 'business', price: 1200000 * UAH, income: 4000 * UAH },
];

// Кожен куплений транспорт додає 1 % до виграшів в іграх.
export const VEHICLE_BOOST = 0.01;

export function vehicleCount(owned: string[]) {
  return owned.filter((id) => findItem(id)?.category === 'car').length;
}

export function vehicleBoost(owned: string[]) {
  return 1 + VEHICLE_BOOST * vehicleCount(owned);
}

export const SELL_RATE = 0.7;
export const INCOME_CAP_HOURS = 24;

export function sellPrice(item: ShopItem) {
  return item.prize ? item.price : Math.floor(item.price * SELL_RATE);
}

export function findItem(id: string) {
  return SHOP_ITEMS.find((i) => i.id === id);
}

export function assetsValue(owned: string[]) {
  return owned.reduce((s, id) => s + (findItem(id)?.price ?? 0), 0);
}

export function hourlyIncome(owned: string[]) {
  return owned.reduce((s, id) => s + (findItem(id)?.income ?? 0), 0);
}

export const STATUSES: { min: number; title: string; emoji: string }[] = [
  { min: 0, title: 'Бомж', emoji: '🥫' },
  { min: 500 * UAH, title: 'Безробітний', emoji: '🛋️' },
  { min: 2000 * UAH, title: 'Студент', emoji: '🎒' },
  { min: 8000 * UAH, title: 'Робітяга', emoji: '🧰' },
  { min: 20000 * UAH, title: 'Таксист', emoji: '🚕' },
  { min: 50000 * UAH, title: 'Середній клас', emoji: '👔' },
  { min: 100000 * UAH, title: 'Підприємець', emoji: '💼' },
  { min: 300000 * UAH, title: 'Бізнесмен', emoji: '🏢' },
  { min: 1000000 * UAH, title: 'Мільйонер', emoji: '💰' },
  { min: 3000000 * UAH, title: 'Магнат', emoji: '🎩' },
  { min: 10000000 * UAH, title: 'Олігарх', emoji: '👑' },
  { min: 50000000 * UAH, title: 'Ахметов', emoji: '🏆' },
];

export function statusFor(netWorth: number) {
  let s = STATUSES[0];
  for (const x of STATUSES) if (netWorth >= x.min) s = x;
  return s;
}
