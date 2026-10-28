// Casino Victor: функція бота. Прив'язує Telegram до акаунта і надсилає сповіщення
// про повідомлення, подарунки та виклики на дуель.
// Токен бота береться із секрету TELEGRAM_BOT_TOKEN (Edge Functions → Secrets), у коді його немає.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
// Секретне слово вебхука (Edge Functions → Secrets → TG_WEBHOOK_SECRET), те саме, що в setWebhook.
const HOOK_SECRET = Deno.env.get('TG_WEBHOOK_SECRET') ?? '';
const APP_URL = 'https://yaromchik2008-web.github.io/Casino/';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const GAMES: Record<string, string> = {
  'golden-karas': '🐟 Золотий Карась',
  'fruit-classic': '🍒 Фруктова класика',
  shakhta: '⛏️ Шахта',
};
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const money = (kop: number) => `${(kop / 100).toLocaleString('uk-UA', { maximumFractionDigits: 2 })} ₴`;

async function hmac(key: ArrayBuffer | Uint8Array, data: string) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)));
}

// Перевірка підпису Telegram Mini App: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verifyInitData(initData: string): Promise<number | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !BOT) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac(new TextEncoder().encode('WebAppData'), BOT);
  const sig = [...(await hmac(secret, check))].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (sig !== hash) return null;
  if (Date.now() / 1000 - Number(params.get('auth_date') ?? 0) > 7 * 86400) return null;
  const user = JSON.parse(params.get('user') ?? '{}');
  return typeof user.id === 'number' ? user.id : null;
}

async function send(userId: string, text: string) {
  const { data } = await admin.from('tg_links').select('tg_id').eq('user_id', userId).maybeSingle();
  if (!data || !BOT) return console.log('skip send', { linked: !!data, token: !!BOT });
  const res = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: data.tg_id,
      text,
      reply_markup: { inline_keyboard: [[{ text: '🎰 Відкрити Casino Victor', web_app: { url: APP_URL } }]] },
    }),
  });
  if (!res.ok) console.log('telegram error', await res.text());
}

// Бот отримав /start: вітаємо й даємо кнопку входу в гру. Запрошення ref_КОД передаємо в гру.
async function onStart(chatId: number, payload: string) {
  const ref = payload.match(/^ref_([A-Z0-9]{6})$/i)?.[1]?.toUpperCase();
  const url = ref ? `${APP_URL}?ref=${ref}` : APP_URL;
  const text = ref
    ? '🎉 Тебе запросив друг! Натисни кнопку нижче, заходь у гру, і ви обоє отримаєте по 200 ігрових ₴.'
    : '🎰 Вітаю в Casino Victor! Натисни кнопку нижче, щоб почати грати.';
  const res = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: { inline_keyboard: [[{ text: '🎰 Грати в Casino Victor', web_app: { url } }]] } }),
  });
  if (!res.ok) console.log('telegram error', await res.text());
}

async function nameOf(id: string) {
  const { data } = await admin.from('profiles').select('name').eq('id', id).maybeSingle();
  return data?.name ?? 'Друг';
}

async function notify(table: string, id: number) {
  if (!['messages', 'transfers', 'duels'].includes(table)) return;
  // Позначаємо запис, щоб кожне сповіщення пішло рівно один раз.
  const { data: row } = await admin.from(table).update({ notified: true }).eq('id', id).eq('notified', false).select().maybeSingle();
  if (!row) return;
  if (table === 'messages') {
    // Хто зараз у грі, і так бачить чат: не спамимо.
    const { data: p } = await admin.from('profiles').select('updated_at').eq('id', row.receiver).maybeSingle();
    if (p && Date.now() - new Date(p.updated_at).getTime() < 90_000) return;
    if (String(row.body).startsWith('⚔️') || String(row.body).startsWith('🎁')) return; // про це окреме сповіщення
    await send(row.receiver, `💬 ${await nameOf(row.sender)}: ${String(row.body).slice(0, 200)}`);
  } else if (table === 'transfers' && row.sender) {
    await send(row.receiver, `🎁 ${await nameOf(row.sender)} надіслав тобі подарунок: ${money(row.amount)}`);
  } else if (table === 'duels') {
    await send(
      row.opponent,
      `⚔️ ${await nameOf(row.challenger)} кличе тебе на дуель!\n${GAMES[row.game] ?? row.game}, ставка ${money(row.stake)}.\nВиклик діє 1 хвилину, прийми у вкладці «Друзі».`,
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();
    // Оновлення від Telegram (вебхук бота).
    if (body.update_id != null) {
      if (!HOOK_SECRET || req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== HOOK_SECRET) {
        console.log('webhook secret mismatch');
        return new Response('forbidden', { status: 403 });
      }
      const msg = body.message;
      const text = String(msg?.text ?? '');
      if (msg?.chat?.type === 'private' && text.startsWith('/start')) await onStart(msg.chat.id, text.split(' ')[1] ?? '');
      return new Response('ok');
    }
    if (body.action === 'link') {
      const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
      const { data } = await admin.auth.getUser(jwt);
      const tgId = await verifyInitData(String(body.initData ?? ''));
      if (!data.user || !tgId) {
        console.log('link failed', { user: !!data.user, tg: !!tgId, token: !!BOT });
        return new Response(JSON.stringify({ ok: false }), { status: 400, headers: cors });
      }
      console.log('linked', data.user.id);
      await admin.from('tg_links').upsert({ user_id: data.user.id, tg_id: tgId, updated_at: new Date().toISOString() });
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }
    await notify(String(body.table), Number(body.id));
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: cors });
  }
});
