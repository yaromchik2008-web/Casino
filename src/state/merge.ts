// Тристороннє злиття стану гравця: base — що було на сервері, коли цей пристрій востаннє синхронізувався,
// local — що зараз у грі, server — новий стан із сервера (інший пристрій, переказ, розробник).
// Зміни з обох боків складаються: якщо тут програв 50 ₴, а друг подарував 100 ₴, баланс стане +50 ₴.

type Obj = Record<string, unknown>;

// Числа, де беремо більше значення, а не суму змін (час, рівні, серії).
const MAX_KEYS = new Set(['lastHourlyAt', 'lastWheelAt', 'incomeAt', 'pickaxe', 'dailyStreak', 'level', 'xpV', 'resetAt', 'biggestWin']);
// Списки, де порядок важливий: беремо локальний.
const LOCAL_KEYS = new Set(['recent']);

function same(a: unknown, b: unknown) {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function isObj(v: unknown): v is Obj {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function mergeList(b: unknown[], l: unknown[], s: unknown[]): unknown[] {
  // Список об'єктів з id (ставки на спорт): об'єднуємо, закрита ставка важливіша за відкриту.
  if ([...l, ...s].some((x) => isObj(x) && 'id' in x)) {
    const byId = new Map<string, Obj>();
    for (const x of [...s, ...l] as Obj[]) {
      const id = String(x.id);
      const prev = byId.get(id);
      if (!prev || (prev.status === 'open' && x.status !== 'open')) byId.set(id, x);
    }
    const order = [...l, ...s].map((x) => String((x as Obj).id));
    return [...new Set(order)].map((id) => byId.get(id)!).slice(0, 50);
  }
  // Список рядків (майно, улюблені, досягнення): додане тут додаємо, прибране тут прибираємо.
  const added = l.filter((x) => !b.includes(x));
  const removed = b.filter((x) => !l.includes(x));
  const out = s.filter((x) => !removed.includes(x));
  for (const x of added) if (!out.includes(x)) out.push(x);
  return out;
}

export function merge3(base: Obj, local: Obj, server: Obj, key = ''): Obj {
  const out: Obj = { ...server };
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(server)]);
  for (const k of keys) {
    const b = base[k];
    const l = local[k];
    const s = server[k];
    if (same(l, b)) continue; // тут не змінювали: лишається серверне
    if (same(s, b) || s === undefined) {
      out[k] = l; // на сервері не змінювали: беремо наше
      continue;
    }
    if (LOCAL_KEYS.has(k)) out[k] = l;
    else if (typeof l === 'number' && typeof s === 'number') {
      out[k] = MAX_KEYS.has(k) ? Math.max(l, s) : s + (l - (typeof b === 'number' ? b : 0));
    } else if (Array.isArray(l) && Array.isArray(s)) out[k] = mergeList(Array.isArray(b) ? b : [], l, s);
    else if (isObj(l) && isObj(s)) out[k] = merge3(isObj(b) ? b : {}, l, s, k);
    else out[k] = l;
  }
  if (!key && typeof out.balance === 'number') out.balance = Math.max(0, Math.round(out.balance));
  return out;
}
