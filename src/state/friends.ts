import AsyncStorage from '@react-native-async-storage/async-storage';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { BOT_USERNAME, SUPABASE_ANON_KEY, SUPABASE_URL, WEB_URL, friendsEnabled } from '../config';
import { cloudGet, cloudSet, telegramInitData, telegramName, waitTelegram } from '../telegram';

const CLOUD_KEY = 'sb_refresh';

export interface Profile {
  id: string;
  code: string;
  name: string;
  balance: number;
  level: number;
  status: string;
  updated_at: string;
  owned?: string[];
}

export interface Message {
  id: number;
  sender: string;
  receiver: string;
  body: string;
  created_at: string;
}

export type DuelStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'finished';

export interface Duel {
  id: number;
  challenger: string;
  opponent: string;
  game: string;
  stake: number;
  status: DuelStatus;
  challenger_score: number | null;
  opponent_score: number | null;
  winner: string | null;
  created_at: string;
  updated_at: string;
  accepted_at?: string | null;
}

export interface Leader {
  id: string;
  name: string;
  balance: number;
  level: number;
  status: string;
  rank: number;
}

export interface TourneyRow {
  id: string;
  name: string;
  earned: number;
}

export interface TourneyResult {
  round: number;
  winner: string | null;
  pool: number;
  players: number;
}

export const TOURNEY_FEE = 20000;
export const TOURNEY_MS = 6 * 3600_000;

/** Поточний 6-годинний раунд турніру, як на сервері. */
export function tourneyRound(now = Date.now()) {
  return Math.floor(now / TOURNEY_MS);
}

let client: SupabaseClient | null = null;
let me: Profile | null = null;
let starting: Promise<Profile> | null = null;

function db() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const ERRORS: Record<string, string> = {
  not_found: 'Гравця з таким кодом немає',
  self: 'Це твій власний код',
  not_friends: 'Ви ще не друзі',
  daily_limit: 'Ліміт: 10 000 ₴ на добу',
  bad_amount: 'Невірна сума',
  duel_closed: 'Ця дуель уже закрита',
  already_played: 'Ти вже зіграв свій раунд',
  too_many_duels: 'Забагато відкритих дуелей (до 10)',
  duels_check: 'Ставка від 1 до 10 000 ₴',
  already_joined: 'Ти вже в цьому турнірі',
  already_referred: 'Ти вже отримав бонус за запрошення',
  referral_too_late: 'Код друга можна ввести лише в перші 7 днів гри',
  referral_limit: 'Цей друг уже запросив максимум гравців',
  durak_busy: 'У тебе вже є відкритий стіл або гра в дурака',
  durak_taken: 'За цей стіл уже сіли',
  durak_closed: 'Ця гра вже закінчилась',
  durak_stale: 'Стан гри оновився, спробуй ще раз',
  durak_turn: 'Зараз хід суперника',
  durak_wait: 'Суперник ще має час на хід',
  durak_bad: 'Сервер не прийняв хід',
  not_admin: 'Немає прав розробника',
  no_profile: 'Профіль ще створюється, спробуй за хвилину',
};

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  for (const k of Object.keys(ERRORS)) if (msg.includes(k)) return ERRORS[k];
  if (msg.toLowerCase().includes('anonymous')) return 'На сервері не ввімкнено анонімний вхід';
  if (/referral/.test(msg) && (msg.includes('schema cache') || msg.includes('Could not find') || msg.includes('does not exist')))
    return 'На сервері ще не запущено SQL з docs/supabase-v5.sql';
  if (/tourney|leaderboard|settle|rank/.test(msg) && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('Could not find')))
    return 'На сервері ще не запущено SQL з docs/supabase-v3.sql';
  if (/admin|top_referrers/.test(msg) && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('Could not find')))
    return 'На сервері ще не запущено SQL з docs/supabase-v12.sql';
  if (msg.includes('duel_id') || msg.includes('durak_duel'))
    return 'На сервері ще не запущено SQL з docs/supabase-v11.sql';
  if (msg.includes('durak') && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('Could not find')))
    return 'На сервері ще не запущено SQL з docs/supabase-v10.sql';
  if (msg.includes('duel') && (msg.includes('schema cache') || msg.includes('does not exist')))
    return 'На сервері ще не запущено SQL з docs/supabase-duels.sql';
  if (msg.includes('schema cache') || msg.includes('does not exist')) return 'На сервері ще не запущено SQL з docs/supabase.sql';
  return 'Немає зв’язку з сервером. Спробуй пізніше';
}

/** Входить анонімно і створює профіль з кодом друга. */
export function startFriends(defaultName: string): Promise<Profile> {
  if (!friendsEnabled()) return Promise.reject(new Error('disabled'));
  if (me) return Promise.resolve(me);
  if (starting) return starting;
  starting = (async () => {
    const sb = db();
    const inTelegram = await waitTelegram();
    let { data } = await sb.auth.getSession();
    if (!data.session && inTelegram) {
      // Той самий акаунт, навіть якщо Telegram очистив пам'ять або це інший телефон.
      const saved = await cloudGet(CLOUD_KEY);
      if (saved) {
        const res = await sb.auth.refreshSession({ refresh_token: saved });
        if (!res.error && res.data.session) data = { session: res.data.session };
      }
    }
    if (!data.session) {
      const res = await sb.auth.signInAnonymously();
      if (res.error) throw res.error;
      data = { session: res.data.session! };
    }
    if (inTelegram) {
      cloudSet(CLOUD_KEY, data.session!.refresh_token);
      sb.auth.onAuthStateChange((_event, session) => {
        if (session?.refresh_token) cloudSet(CLOUD_KEY, session.refresh_token);
      });
    }
    const uid = data.session!.user.id;
    const existing = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      me = existing.data as Profile;
      // Старі профілі з іменем за замовчуванням отримують ім'я з Telegram.
      const tgName = telegramName();
      if (tgName && me.name === 'Гравець') {
        const upd = await sb.from('profiles').update({ name: tgName }).eq('id', uid);
        if (!upd.error) me = { ...me, name: tgName };
      }
      if (inTelegram) linkTelegram(telegramInitData()).catch(() => {});
      return me;
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const ins = await sb
        .from('profiles')
        .insert({ id: uid, code: newCode(), name: (telegramName() ?? defaultName).slice(0, 24) || 'Гравець' })
        .select()
        .single();
      if (!ins.error) {
        me = ins.data as Profile;
        if (inTelegram) linkTelegram(telegramInitData()).catch(() => {});
        return me;
      }
      if (!ins.error.message.includes('duplicate')) throw ins.error;
    }
    throw new Error('code');
  })();
  starting.catch(() => (starting = null));
  return starting;
}

export function myProfile() {
  return me;
}

let ownedColumn = true;

export async function syncProfile(fields: Partial<Pick<Profile, 'balance' | 'level' | 'status' | 'name' | 'owned'>>) {
  if (!me) return;
  const send = (f: typeof fields) =>
    db()
      .from('profiles')
      .update({ ...f, updated_at: new Date().toISOString() })
      .eq('id', me!.id)
      .select()
      .single();
  // Колонки owned немає, поки не запущено docs/supabase-v4.sql: тоді синхронізуємо без майна.
  const { owned, ...rest } = fields;
  let { data, error } = await send(ownedColumn && owned ? fields : rest);
  if (error && owned && ownedColumn && /owned/.test(error.message)) {
    ownedColumn = false;
    ({ data, error } = await send(rest));
  }
  if (!error && data) me = data as Profile;
}

export async function fetchProfile(id: string): Promise<Profile | null> {
  const { data, error } = await db().from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

export async function listFriends(): Promise<Profile[]> {
  if (!me) return [];
  const links = await db().from('friendships').select('friend_id').eq('user_id', me.id);
  if (links.error) throw links.error;
  const ids = (links.data ?? []).map((l) => l.friend_id as string);
  if (!ids.length) return [];
  const { data, error } = await db().from('profiles').select('*').in('id', ids);
  if (error) throw error;
  return ((data ?? []) as Profile[]).sort((a, b) => b.balance - a.balance);
}

export async function addFriend(code: string) {
  const { error } = await db().rpc('add_friend', { friend_code: code });
  if (error) throw error;
}

export async function removeFriend(id: string) {
  const { error } = await db().rpc('remove_friend', { fid: id });
  if (error) throw error;
}

export async function loadMessages(friendId: string): Promise<Message[]> {
  if (!me) return [];
  const { data, error } = await db()
    .from('messages')
    .select('*')
    .or(`and(sender.eq.${me.id},receiver.eq.${friendId}),and(sender.eq.${friendId},receiver.eq.${me.id})`)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  return ((data ?? []) as Message[]).reverse();
}

/** Нові повідомлення мені після моменту since (час сервера) з іменами відправників. */
export async function inboxSince(since: string | null): Promise<{ latest: string | null; items: { name: string; body: string }[] }> {
  if (!me) return { latest: since, items: [] };
  let q = db().from('messages').select('sender, body, created_at').eq('receiver', me.id).order('created_at', { ascending: false }).limit(5);
  if (since) q = q.gt('created_at', since);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as { sender: string; body: string; created_at: string }[];
  if (!rows.length) return { latest: since, items: [] };
  // Перший запуск лише запам'ятовує, де ми зупинились, без старих сповіщень.
  if (!since) return { latest: rows[0].created_at, items: [] };
  const ids = [...new Set(rows.map((r) => r.sender))];
  const names = await db().from('profiles').select('id, name').in('id', ids);
  const byId = new Map(((names.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  return { latest: rows[0].created_at, items: rows.reverse().map((r) => ({ name: byId.get(r.sender) ?? 'Друг', body: r.body })) };
}

export async function sendMessage(friendId: string, body: string) {
  const { error } = await db().from('messages').insert({ receiver: friendId, body: body.slice(0, 500) });
  if (error) throw error;
}

export async function sendCoins(friendId: string, amount: number) {
  const { error } = await db().rpc('send_coins', { p_to: friendId, p_amount: Math.round(amount) });
  if (error) throw error;
}

/** Забирає гроші, які надіслали друзі; повертає суму в копійках. */
export async function claimTransfers(): Promise<number> {
  if (!me) return 0;
  const { data, error } = await db().rpc('claim_transfers');
  if (error) throw error;
  return Number(data ?? 0);
}

/** Дуелі гравця за останні дні, нові зверху. */
export async function listDuels(): Promise<Duel[]> {
  if (!me) return [];
  // Закриває прострочені виклики й раунди (з docs/supabase-v3.sql; без нього просто пропускаємо).
  await db().rpc('settle_duels').then(
    () => {},
    () => {},
  );
  const { data, error } = await db()
    .from('duels')
    .select('*')
    .or(`challenger.eq.${me.id},opponent.eq.${me.id}`)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as Duel[];
}

export async function createDuel(opponent: string, game: string, stake: number) {
  const { error } = await db().rpc('create_duel', { p_opponent: opponent, p_game: game, p_stake: Math.round(stake) });
  if (error) throw error;
}

export async function respondDuel(id: number, accept: boolean) {
  const { error } = await db().rpc('respond_duel', { p_id: id, p_accept: accept });
  if (error) throw error;
}

export async function cancelDuel(id: number) {
  const { error } = await db().rpc('cancel_duel', { p_id: id });
  if (error) throw error;
}

export async function submitDuelScore(id: number, score: number) {
  const { error } = await db().rpc('submit_duel_score', { p_id: id, p_score: Math.max(0, Math.round(score)) });
  if (error) throw error;
}

export async function leaderboard(): Promise<{ top: Leader[]; myRank: number | null }> {
  const [top, rank] = await Promise.all([db().rpc('leaderboard'), me ? db().rpc('my_rank') : Promise.resolve({ data: null, error: null })]);
  if (top.error) throw top.error;
  return { top: (top.data ?? []) as Leader[], myRank: rank.data == null ? null : Number(rank.data) };
}

export async function joinTourney(): Promise<number> {
  const { data, error } = await db().rpc('join_tourney');
  if (error) throw error;
  return Number(data);
}

export async function reportTourney(round: number, earned: number) {
  const { error } = await db().rpc('report_tourney', { p_round: round, p_earned: Math.round(earned) });
  if (error) throw error;
}

export async function tourneyBoard(round: number): Promise<TourneyRow[]> {
  const { data, error } = await db().rpc('tourney_board', { p_round: round });
  if (error) throw error;
  return ((data ?? []) as TourneyRow[]).map((r) => ({ ...r, earned: Number(r.earned) }));
}

export async function lastTourneyResult(): Promise<TourneyResult | null> {
  await db().rpc('settle_tourneys').then(
    () => {},
    () => {},
  );
  const { data, error } = await db().from('tourney_results').select('*').order('round', { ascending: false }).limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as TourneyResult) ?? null;
}

/** Прив'язує Telegram до акаунта, щоб бот міг надсилати сповіщення. Сервер перевіряє підпис initData. */
/** Посилання на оплату пакета зірками (docs/supabase-v9.sql + функція бота). */
export async function createStarsInvoice(pack: string): Promise<string> {
  const res = await db().functions.invoke('tg', { body: { action: 'invoice', pack } });
  const error = res.error;
  // Функція може віддати JSON як текст (без Content-Type), тоді розбираємо самі.
  let data = res.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  if (error || !data?.ok || !data.link) throw new Error(data?.error ?? error?.message ?? 'стара версія функції tg');
  return data.link as string;
}

export async function linkTelegram(initData: string) {
  if (!me || !initData) return;
  await db().functions.invoke('tg', { body: { action: 'link', initData } });
}

/** Бонус за запрошення: обидва отримують по 200 ₴. Повертає ім'я того, хто запросив. */
/** Баланс, який виставив адмін (docs/supabase-v7.sql), або null. */
export async function takeBalanceOverride(): Promise<number | null> {
  if (!me) return null;
  const { data, error } = await db().rpc('take_balance_override');
  if (error) return null;
  return data == null ? null : Number(data);
}

export async function claimReferral(code: string): Promise<string> {
  const { data, error } = await db().rpc('claim_referral', { p_code: code.trim().toUpperCase() });
  if (error) throw error;
  return String(data ?? 'Друг');
}

export async function myReferrals(): Promise<number> {
  const { data, error } = await db().rpc('my_referrals');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function topReferrers(): Promise<{ name: string; invited: number }[]> {
  const { data, error } = await db().rpc('top_referrers');
  if (error) throw error;
  return (data ?? []) as { name: string; invited: number }[];
}

// Термінал розробника. Права перевіряє сервер (таблиця admins), тут лише виклики.
export type AdminKind = 'balance_set' | 'balance_add' | 'balance_take' | 'item_give' | 'item_take' | 'level_set' | 'message' | 'reset';

export interface AdminAction {
  id: number;
  kind: AdminKind;
  value: number | null;
  item: string | null;
  note: string | null;
}

export async function adminPlayers(query = ''): Promise<Profile[]> {
  const { data, error } = await db().rpc('admin_players', { p_query: query });
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function adminAct(code: string, kind: AdminKind, opts: { value?: number; item?: string; note?: string } = {}): Promise<string> {
  const { data, error } = await db().rpc('admin_act', {
    p_code: code.trim().toUpperCase(),
    p_kind: kind,
    p_value: opts.value ?? null,
    p_item: opts.item ?? null,
    p_note: opts.note ?? null,
  });
  if (error) throw error;
  return String(data ?? '');
}

/** Команди адміна для мене. Без SQL v12 на сервері просто нічого не повертає. */
export async function takeAdminActions(): Promise<AdminAction[]> {
  if (!me) return [];
  const { data, error } = await db().rpc('take_admin_actions');
  if (error) return [];
  return ((data ?? []) as AdminAction[]).map((a) => ({ ...a, value: a.value == null ? null : Number(a.value) }));
}

export function inviteLink(code: string) {
  // Посилання відкриває чат бота: друг тисне «Старт», і бот дає кнопку входу в гру з кодом запрошення.
  return BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?start=ref_${code}` : `${WEB_URL}?ref=${code}`;
}

export interface DurakTable {
  id: number;
  host: string;
  guest: string | null;
  stake: number;
  deck_size: 36 | 54;
  status: 'open' | 'playing' | 'finished' | 'cancelled';
  state: unknown;
  version: number;
  turn: number | null;
  loser: number | null;
  updated_at: string;
}

export interface DurakLobbyRow {
  id: number;
  host: string;
  host_name: string;
  stake: number;
  deck_size: 36 | 54;
}

/** Відкриті столи інших гравців (docs/supabase-v10.sql). */
export async function durakLobby(): Promise<DurakLobbyRow[]> {
  const { data, error } = await db().rpc('durak_lobby');
  if (error) throw error;
  return (data ?? []) as DurakLobbyRow[];
}

/** Мій стіл, що ще чекає або грає, або щойно закінчений. */
export async function durakMine(): Promise<DurakTable | null> {
  if (!me) return null;
  const { data, error } = await db()
    .from('durak_tables')
    .select('*')
    .or(`host.eq.${me.id},guest.eq.${me.id}`)
    .in('status', ['open', 'playing'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as DurakTable) ?? null;
}

export async function durakGet(id: number): Promise<DurakTable | null> {
  const { data, error } = await db().from('durak_tables').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as DurakTable | null;
}

export async function durakCreate(stake: number, deck: 36 | 54): Promise<number> {
  const { data, error } = await db().rpc('durak_create', { p_stake: Math.round(stake), p_deck: deck });
  if (error) throw error;
  return Number(data);
}

export async function durakCancel(id: number) {
  const { error } = await db().rpc('durak_cancel', { p_id: id });
  if (error) throw error;
}

export async function durakJoin(id: number, state: unknown, turn: number) {
  const { error } = await db().rpc('durak_join', { p_id: id, p_state: state, p_turn: turn });
  if (error) throw error;
}

export async function durakMove(id: number, version: number, state: unknown, turn: number | null, loser: number | null) {
  const { error } = await db().rpc('durak_move', { p_id: id, p_version: version, p_state: state, p_turn: turn, p_loser: loser });
  if (error) throw error;
}

export async function durakClaim(id: number) {
  const { error } = await db().rpc('durak_claim', { p_id: id });
  if (error) throw error;
}

export async function profileName(id: string): Promise<string | null> {
  const { data } = await db().from('profiles').select('name').eq('id', id).maybeSingle();
  return (data?.name as string) ?? null;
}

/** Стіл дурака для дуелі (docs/supabase-v11.sql). */
export async function durakByDuel(duelId: number): Promise<DurakTable | null> {
  const { data, error } = await db().from('durak_tables').select('*').eq('duel_id', duelId).maybeSingle();
  if (error) throw error;
  return data as DurakTable | null;
}

export async function durakDuelStart(duelId: number, state: unknown, turn: number) {
  const { error } = await db().rpc('durak_duel_start', { p_duel: duelId, p_state: state, p_turn: turn });
  if (error) throw error;
}
