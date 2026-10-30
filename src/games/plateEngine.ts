// «Автономера»: випадковий український номер. Ціна номера залежить від цифр (за таблицею ghj).
// Кожен номер існує в грі лише один: унікальність перевіряє сервер (docs/supabase-v13.sql).

export const PLATE_COST = 150000; // 1 500 ₴ за оберт

export const FIRST = (
  'АА АВ АС АЕ АН АМ АО АР АТ АХ ВА ВВ ВС ВЕ ВН ВО ВП ВР ВТ ВХ СА СВ СЕ СН КА КВ КС КЕ КН КМ КО КР КТ КХ ' +
  'НА НВ НС НЕ НН НО НП НР НТ НХ ІА ІВ ІС ІЕ ІН ІМ ІО ІР ІТ ІХ ТА ТВ ТС ТЕ ТН ТМ ТО ТР ТТ ТХ МВ МГ МН ММ ED DC DI PD'
).split(' ');
const EXCLUDED_LAST = ['ED', 'DC', 'DI', 'PD', 'МВ', 'МГ', 'МН', 'ММ'];
export const LAST = FIRST.filter((x) => !EXCLUDED_LAST.includes(x));

/** Іменні номери: найдорожчі, кожен лише в одного гравця. */
export const SPECIAL = ['АУЕ', 'VIKTOR', 'МВС', 'ВОР', 'ВАСИЛЬ'];

export interface PlateTier {
  value: number; // копійки
  title: string;
}

export const TIERS = {
  plain: { value: 100000, title: 'Звичайний' },
  nice: { value: 480000, title: 'Красива комбінація' },
  zeros: { value: 1200000, title: 'Нулі або шістки' },
  pairs: { value: 1800000, title: 'Популярні пари' },
  elite: { value: 6000000, title: 'Елітний' },
  exclusive: { value: 9600000, title: 'Ексклюзив' },
} satisfies Record<string, PlateTier>;

export function digitsTier(d: string): PlateTier {
  const [a, b, c, e] = d.split('').map(Number);
  const allSame = a === b && b === c && c === e;
  if (d === '0001' || d === '0007' || d === '7777') return TIERS.exclusive;
  if (allSame && d !== '6666') return TIERS.elite;
  if (a === 0 && b === 0 && c === 0 && e >= 2 && e !== 6) return TIERS.elite;
  const ascending = b === a + 1 && c === b + 1 && e === c + 1;
  const twoPairs = a === b && c === e && a !== c;
  const threeEnd = b === c && c === e && a !== b;
  if (ascending || twoPairs || threeEnd) return TIERS.pairs;
  if (d === '0006' || d === '6666' || (a === 0 && b === 0 && c !== e)) return TIERS.zeros;
  const mirror = a === e && b === c;
  const repeat = a === c && b === e;
  const sixes = d.split('').filter((x) => x === '6').length;
  if (mirror || repeat || sixes >= 3 || d.includes('66')) return TIERS.nice;
  return TIERS.plain;
}

export function plateTier(plate: string): PlateTier {
  if (SPECIAL.includes(plate)) return TIERS.exclusive;
  const m = plate.match(/ (\d{4}) /);
  return m ? digitsTier(m[1]) : TIERS.plain;
}

// Рівномірні цифри віддавали б 112 % ставки, тож категорії мають свої шанси (≈ 92 % RTP, перевірено симуляцією):
// спершу обираємо категорію, потім випадкову комбінацію цифр з неї.
const POOLS: Record<string, string[]> = (() => {
  const pools: Record<string, string[]> = {};
  for (let i = 0; i < 10000; i++) {
    const d = String(i).padStart(4, '0');
    (pools[digitsTier(d).title] ??= []).push(d);
  }
  return pools;
})();

export const TIER_ODDS: [PlateTier, number][] = [
  [TIERS.exclusive, 0.0005],
  [TIERS.elite, 0.0012],
  [TIERS.pairs, 0.006],
  [TIERS.zeros, 0.006],
  [TIERS.nice, 0.02],
];
export const SPECIAL_P = 0.0002;

const pick = <T,>(a: T[], rnd: () => number) => a[Math.floor(rnd() * a.length)];

export function randomPlate(rnd: () => number = Math.random): string {
  if (rnd() < SPECIAL_P) return pick(SPECIAL, rnd);
  let tier: PlateTier = TIERS.plain;
  let r = rnd();
  for (const [t, p] of TIER_ODDS) {
    if (r < p) {
      tier = t;
      break;
    }
    r -= p;
  }
  const digits = pick(POOLS[tier.title], rnd);
  return `${pick(FIRST, rnd)} ${digits} ${pick(LAST, rnd)}`;
}
