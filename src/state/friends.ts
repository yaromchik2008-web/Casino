import AsyncStorage from '@react-native-async-storage/async-storage';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, friendsEnabled } from '../config';

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
};

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  for (const k of Object.keys(ERRORS)) if (msg.includes(k)) return ERRORS[k];
  if (msg.toLowerCase().includes('anonymous')) return 'На сервері не ввімкнено анонімний вхід';
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
    let { data } = await sb.auth.getSession();
    if (!data.session) {
      const res = await sb.auth.signInAnonymously();
      if (res.error) throw res.error;
      data = { session: res.data.session! };
    }
    const uid = data.session!.user.id;
    const existing = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      me = existing.data as Profile;
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
