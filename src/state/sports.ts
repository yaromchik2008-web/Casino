// Симульовані спортивні матчі: розклад, коефіцієнти і результат детерміновані з id матчу.

export type Sport = 'football' | 'basketball' | 'tennis' | 'hockey';
export type League = 'ua' | 'world';
export type Market = '1' | 'X' | '2' | 'over' | 'under';

export const SLOT_MS = 2 * 60 * 1000; // нова пачка матчів кожні 2 хвилини
export const MATCH_MS = 4 * 60 * 1000; // матч триває 4 хвилини
export const PER_SLOT = 4;
export const UPCOMING_SLOTS = 4;

export const SPORTS: Record<Sport, { label: string; icon: string; minutes: number }> = {
  football: { label: 'Футбол', icon: '⚽', minutes: 90 },
  basketball: { label: 'Баскетбол', icon: '🏀', minutes: 40 },
  tennis: { label: 'Теніс', icon: '🎾', minutes: 3 },
  hockey: { label: 'Хокей', icon: '🏒', minutes: 60 },
};

const UA_CITIES = [
  'Київ', 'Львів', 'Харків', 'Одеса', 'Дніпро', 'Запоріжжя', 'Полтава', 'Луцьк', 'Ужгород',
  'Чернігів', 'Вінниця', 'Суми', 'Житомир', 'Рівне', 'Тернопіль', 'Кривий Ріг', 'Миколаїв', 'Черкаси',
];
const WORLD_FOOTBALL = [
  'Україна', 'Франція', 'Іспанія', 'Німеччина', 'Італія', 'Англія', 'Бразилія', 'Аргентина',
  'Португалія', 'Нідерланди', 'Бельгія', 'Хорватія', 'Польща', 'Японія', 'США', 'Мексика',
];
const WORLD_HOCKEY = ['Канада', 'Швеція', 'Фінляндія', 'Чехія', 'Україна', 'Латвія', 'Словаччина', 'Німеччина', 'США', 'Швейцарія'];
const WORLD_BASKET = ['США', 'Іспанія', 'Сербія', 'Франція', 'Литва', 'Греція', 'Австралія', 'Україна', 'Канада', 'Словенія'];
const PLAYERS_UA = ['О. Коваленко', 'М. Шевчук', 'А. Бондар', 'Д. Мельник', 'І. Ткаченко', 'В. Кравець', 'Н. Савчук', 'Т. Литвин'];
const PLAYERS_WORLD = ['Л. Мартен', 'К. Россі', 'Х. Гарсія', 'Д. Міллер', 'Я. Новак', 'С. Танака', 'Е. Сільва', 'М. Шмідт'];

export interface MatchEvent {
  minute: number;
  side: 'home' | 'away';
  kind: 'goal' | 'card' | 'set';
  points?: number;
}

export interface Match {
  id: string;
  sport: Sport;
  league: League;
  home: string;
  away: string;
  kickoff: number;
  end: number;
  odds: Partial<Record<Market, number>>;
  totalLine?: number;
  final: { home: number; away: number };
  events: MatchEvent[];
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poissonP(l: number, k: number) {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
}

function poissonSample(l: number, r: () => number) {
  const L = Math.exp(-l);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}

function normal(r: () => number) {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

// Матчі України: маржа більша, тож коефіцієнти нижчі. Світові: маржа менша, коефіцієнти вищі.
const MARGIN: Record<League, number> = { ua: 0.86, world: 0.94 };

function price(p: number, league: League) {
  return Math.max(1.05, Math.round((MARGIN[league] / Math.max(p, 0.01)) * 100) / 100);
}

function pickTwo(list: string[], r: () => number): [string, string] {
  const a = Math.floor(r() * list.length);
  let b = Math.floor(r() * (list.length - 1));
  if (b >= a) b++;
  return [list[a], list[b]];
}

const PLAN: [Sport, League][] = [
  ['football', 'ua'],
  ['football', 'world'],
  ['basketball', 'world'],
  ['hockey', 'world'],
  ['tennis', 'ua'],
  ['football', 'ua'],
  ['tennis', 'world'],
  ['basketball', 'ua'],
];

export function buildMatch(slot: number, index: number): Match {
  const id = `${slot}-${index}`;
  const r = rng(hash(`match:${id}`));
  const [sport, league] = PLAN[(slot * PER_SLOT + index) % PLAN.length];
  const pool =
    sport === 'tennis'
      ? league === 'ua' ? PLAYERS_UA : PLAYERS_WORLD
      : sport === 'hockey'
        ? WORLD_HOCKEY
        : sport === 'basketball'
          ? league === 'ua' ? UA_CITIES : WORLD_BASKET
          : league === 'ua' ? UA_CITIES : WORLD_FOOTBALL;
  const [home, away] = pickTwo(pool, r);
  const rh = 3 + r() * 7;
  const ra = 3 + r() * 7;
  const diff = rh - ra;
  const kickoff = slot * SLOT_MS;
  const end = kickoff + MATCH_MS;
  const minutes = SPORTS[sport].minutes;
  const odds: Partial<Record<Market, number>> = {};
  let totalLine: number | undefined;
  const events: MatchEvent[] = [];
  let final = { home: 0, away: 0 };

  if (sport === 'football' || sport === 'hockey') {
    const base = sport === 'football' ? [1.45, 1.15] : [3.1, 2.7];
    const lh = base[0] * Math.exp(diff * 0.11);
    const la = base[1] * Math.exp(-diff * 0.11);
    let p1 = 0;
    let px = 0;
    let p2 = 0;
    let under = 0;
    totalLine = sport === 'football' ? 2.5 : 5.5;
    for (let i = 0; i <= 12; i++)
      for (let j = 0; j <= 12; j++) {
        const p = poissonP(lh, i) * poissonP(la, j);
        if (i > j) p1 += p;
        else if (i === j) px += p;
        else p2 += p;
        if (i + j < totalLine) under += p;
      }
    odds['1'] = price(p1, league);
    odds.X = price(px, league);
    odds['2'] = price(p2, league);
    odds.over = price(1 - under, league);
    odds.under = price(under, league);
    final = { home: poissonSample(lh, r), away: poissonSample(la, r) };
    for (let g = 0; g < final.home; g++) events.push({ minute: 1 + Math.floor(r() * minutes), side: 'home', kind: 'goal' });
    for (let g = 0; g < final.away; g++) events.push({ minute: 1 + Math.floor(r() * minutes), side: 'away', kind: 'goal' });
    const cards = Math.floor(r() * 4);
    for (let c = 0; c < cards; c++) events.push({ minute: 1 + Math.floor(r() * minutes), side: r() < 0.5 ? 'home' : 'away', kind: 'card' });
  } else if (sport === 'basketball') {
    const mh = 80 + diff * 1.6 + 2;
    const ma = 80 - diff * 1.6;
    const pHome = 1 / (1 + Math.exp(-(mh - ma) / 7));
    odds['1'] = price(pHome, league);
    odds['2'] = price(1 - pHome, league);
    totalLine = Math.round(mh + ma) + 0.5;
    odds.over = price(0.5, league);
    odds.under = price(0.5, league);
    let h = Math.round(mh + normal(r) * 7);
    let a = Math.round(ma + normal(r) * 7);
    if (h === a) {
      if (r() < pHome) h += 2;
      else a += 2;
    }
    final = { home: h, away: a };
  } else {
    const p = 1 / (1 + Math.exp(-diff * 0.35));
    odds['1'] = price(p, league);
    odds['2'] = price(1 - p, league);
    let sh = 0;
    let sa = 0;
    let set = 0;
    while (sh < 2 && sa < 2) {
      set++;
      const homeWins = r() < p;
      if (homeWins) sh++;
      else sa++;
      events.push({ minute: set, side: homeWins ? 'home' : 'away', kind: 'set' });
    }
    final = { home: sh, away: sa };
  }
  events.sort((x, y) => x.minute - y.minute);
  return { id, sport, league, home, away, kickoff, end, odds, totalLine, final, events };
}

export function getMatch(id: string): Match {
  const [slot, index] = id.split('-').map(Number);
  return buildMatch(slot, index);
}

export function currentSlot(now = Date.now()) {
  return Math.floor(now / SLOT_MS);
}

export function upcomingMatches(now = Date.now()): Match[] {
  const s = currentSlot(now);
  const out: Match[] = [];
  for (let k = 1; k <= UPCOMING_SLOTS; k++) for (let i = 0; i < PER_SLOT; i++) out.push(buildMatch(s + k, i));
  return out;
}

export function liveMatches(now = Date.now()): Match[] {
  const s = currentSlot(now);
  const out: Match[] = [];
  for (let k = 0; k * SLOT_MS < MATCH_MS + SLOT_MS; k++)
    for (let i = 0; i < PER_SLOT; i++) {
      const m = buildMatch(s - k, i);
      if (m.kickoff <= now && now < m.end) out.push(m);
    }
  return out;
}

export interface LiveState {
  minute: number;
  home: number;
  away: number;
  events: MatchEvent[];
  finished: boolean;
  started: boolean;
}

export function liveState(m: Match, now = Date.now()): LiveState {
  const minutes = SPORTS[m.sport].minutes;
  if (now < m.kickoff) return { minute: 0, home: 0, away: 0, events: [], finished: false, started: false };
  if (now >= m.end) return { minute: minutes, ...m.final, events: m.events, finished: true, started: true };
  const progress = (now - m.kickoff) / MATCH_MS;
  if (m.sport === 'basketball') {
    const minute = Math.floor(progress * minutes);
    const wobble = (n: number, side: number) => Math.max(0, Math.round(n * progress + Math.sin(progress * 20 + side) * 2));
    return { minute, home: wobble(m.final.home, 1), away: wobble(m.final.away, 2), events: [], finished: false, started: true };
  }
  if (m.sport === 'tennis') {
    const sets = m.events.length;
    const done = Math.floor(progress * (sets + 0.5));
    const ev = m.events.slice(0, done);
    return {
      minute: Math.min(sets, done + 1),
      home: ev.filter((e) => e.side === 'home').length,
      away: ev.filter((e) => e.side === 'away').length,
      events: ev,
      finished: false,
      started: true,
    };
  }
  const minute = Math.floor(progress * minutes) + 1;
  const ev = m.events.filter((e) => e.minute <= minute);
  return {
    minute,
    home: ev.filter((e) => e.kind === 'goal' && e.side === 'home').length,
    away: ev.filter((e) => e.kind === 'goal' && e.side === 'away').length,
    events: ev,
    finished: false,
    started: true,
  };
}

export function pickWins(m: Match, market: Market): boolean {
  const { home, away } = m.final;
  switch (market) {
    case '1':
      return home > away;
    case 'X':
      return home === away;
    case '2':
      return away > home;
    case 'over':
      return home + away > (m.totalLine ?? 0);
    case 'under':
      return home + away < (m.totalLine ?? 0);
  }
}

export function marketLabel(m: Match, market: Market) {
  if (market === '1') return `П1 ${m.home}`;
  if (market === '2') return `П2 ${m.away}`;
  if (market === 'X') return 'Нічия';
  return `${market === 'over' ? 'ТБ' : 'ТМ'} ${m.totalLine}`;
}

export interface SportPick {
  matchId: string;
  market: Market;
  odds: number;
}

export interface SportBet {
  id: string;
  picks: SportPick[];
  stake: number;
  odds: number;
  placedAt: number;
  status: 'open' | 'won' | 'lost';
  payout: number;
}

export function betResult(bet: SportBet, now = Date.now()): 'open' | 'won' | 'lost' {
  const matches = bet.picks.map((p) => getMatch(p.matchId));
  if (matches.some((m) => now < m.end)) return 'open';
  return bet.picks.every((p, i) => pickWins(matches[i], p.market)) ? 'won' : 'lost';
}
