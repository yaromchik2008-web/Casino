import AsyncStorage from '@react-native-async-storage/async-storage';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, friendsEnabled } from '../config';
import { cloudGet, cloudSet, telegramInitData, waitTelegram } from '../telegram';

const CLOUD_KEY = 'sb_refresh';

export interface Profile {
  id: string;
  code: string;
  name: string;
  balance: number;
  level: number;
  status: string;
  updated_at: string;
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
};

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  for (const k of Object.keys(ERRORS)) if (msg.includes(k)) return ERRORS[k];
  if (msg.toLowerCase().includes('anonymous')) return 'На сервері не ввімкнено анонімний вхід';
  if (/tourney|leaderboard|settle|rank/.test(msg) && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('Could not find')))
    return 'На сервері ще не запущено SQL з docs/supabase-v3.sql';
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
      if (inTelegram) linkTelegram(telegramInitData()).catch(() => {});
      return me;
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const ins = await sb
        .from('profiles')
        .insert({ id: uid, code: newCode(), name: defaultName.slice(0, 24) || 'Гравець' })
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

export async function syncProfile(fields: Partial<Pick<Profile, 'balance' | 'level' | 'status' | 'name'>>) {
  if (!me) return;
  const { data, error } = await db()
    .from('profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', me.id)
    .select()
    .single();
  if (!error && data) me = data as Profile;
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
export async function linkTelegram(initData: string) {
  if (!me || !initData) return;
  await db().functions.invoke('tg', { body: { action: 'link', initData } });
}
