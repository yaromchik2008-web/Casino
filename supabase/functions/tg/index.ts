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
  'Content-Type': 'application/json',
};

// Пакети ігрових ₴ за Telegram Stars (той самий список у src/state/stars.ts).
const PACKS: Record<string, { stars: number; amount: number; title: string }> = {
  s5: { stars: 5, amount: 50_000, title: '500 ігрових ₴' },
  s15: { stars: 15, amount: 150_000, title: '1 500 ігрових ₴' },
  s25: { stars: 25, amount: 250_000, title: '2 500 ігрових ₴' },
  s50: { stars: 50, amount: 550_000, title: '5 500 ігрових ₴' },
  s100: { stars: 100, amount: 1_150_000, title: '11 500 ігрових ₴' },
  s250: { stars: 250, amount: 3_000_000, title: '30 000 ігрових ₴' },
  s500: { stars: 500, amount: 6_500_000, title: '65 000 ігрових ₴' },
  s1000: { stars: 1000, amount: 14_000_000, title: '140 000 ігрових ₴' },
};

async function tgApi(method: string, payload: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) console.log('telegram error', method, JSON.stringify(json));
  return json;
}

// Оплата пройшла: записуємо платіж один раз і зараховуємо ігрові ₴ через transfers.
async function onPaid(pay: { telegram_payment_charge_id: string; invoice_payload: string; total_amount: number }) {
  const [userId, packId] = String(pay.invoice_payload).split(':');
  const pack = PACKS[packId];
  if (!pack || pay.total_amount !== pack.stars) return console.log('bad payment', pay.invoice_payload, pay.total_amount);
  const ins = await admin.from('purchases').insert({
    charge_id: pay.telegram_payment_charge_id,
    user_id: userId,
    pack: packId,
    stars: pay.total_amount,
    amount: pack.amount,
  });
  if (ins.error) return console.log('purchase skip', ins.error.message);
  await admin.from('transfers').insert({ sender: null, receiver: userId, amount: pack.amount });
  console.log('paid', userId, packId);
}

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
      if (body.pre_checkout_query) {
        const q = body.pre_checkout_query;
        const pack = PACKS[String(q.invoice_payload).split(':')[1]];
        await tgApi('answerPreCheckoutQuery', pack && q.total_amount === pack.stars
          ? { pre_checkout_query_id: q.id, ok: true }
          : { pre_checkout_query_id: q.id, ok: false, error_message: 'Пакет не знайдено, спробуй ще раз' });
        return new Response('ok');
      }
      const msg = body.message;
      if (msg?.successful_payment) {
        await onPaid(msg.successful_payment);
        return new Response('ok');
      }
      const text = String(msg?.text ?? '');
      if (msg?.chat?.type === 'private' && text.startsWith('/start')) await onStart(msg.chat.id, text.split(' ')[1] ?? '');
      return new Response('ok');
    }
    if (body.action === 'invoice') {
      const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
      const { data } = await admin.auth.getUser(jwt);
      const pack = PACKS[String(body.pack)];
      if (!data.user || !pack) {
        console.log('invoice refused', { user: !!data.user, pack: body.pack, token: !!BOT });
        return new Response(JSON.stringify({ ok: false, error: !data.user ? 'no user' : 'no pack' }), { headers: cors });
      }
      const r = await tgApi('createInvoiceLink', {
        title: pack.title,
        description: `${pack.title} для Casino Victor. Ігрові гривні не можна вивести чи обміняти на справжні гроші.`,
        payload: `${data.user.id}:${body.pack}:${Date.now()}`,
        currency: 'XTR',
        prices: [{ label: pack.title, amount: pack.stars }],
      });
      if (!r.ok) console.log('createInvoiceLink failed', r.description);
      return new Response(JSON.stringify({ ok: !!r.ok, link: r.result, error: r.description }), { headers: cors });
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
