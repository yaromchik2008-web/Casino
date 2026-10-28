# Сповіщення в боті, турнір і лідери: налаштування Supabase

Робиться один раз, приблизно за 5 хвилин.

## 1. SQL
Supabase → **SQL Editor** → **New query** → встав увесь текст з `docs/supabase-v3.sql` → **Run**.
Це вмикає таймер дуелей, таблицю лідерів, турнір «Шість годин» і тригери для бота.

## 2. Функція бота
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Назва функції: `tg` (саме так, маленькими літерами).
3. Зітри приклад коду, встав увесь текст з `supabase/functions/tg/index.ts` → **Deploy function**.
4. Відкрий функцію `tg` → **Details** (або Settings) → вимкни **Verify JWT** (Enforce JWT verification) → **Save**.
   Без цього база не зможе розбудити функцію. Функція сама перевіряє кожен запит, тому це безпечно.

## 3. Токен бота
Supabase → **Edge Functions** → **Secrets** → **Add new secret**:
- Name: `TELEGRAM_BOT_TOKEN`
- Value: токен від @BotFather

Токен вводиш лише там, нікому його не надсилай (і в чат теж).

## 4. Гравцям
Кожен гравець має хоч раз натиснути **Start** у боті й відкрити гру через бота.
Тоді приходитимуть повідомлення: виклик на дуель, подарунок і нове повідомлення в чаті (якщо гравець зараз не в грі).

## 5. Запрошення через бота (кнопка «Старт»)
Посилання-запрошення тепер ведуть у чат бота: друг тисне **Старт**, і бот дає кнопку входу в гру з бонусом 200 ₴.
1. Онови код функції `tg`: Edge Functions → `tg` → Code → встав новий текст з `supabase/functions/tg/index.ts` → **Deploy**.
2. Edge Functions → **Secrets** → **Add new secret**: Name `TG_WEBHOOK_SECRET`, Value: будь-яке своє слово з латинських літер і цифр (наприклад `victor2026hook`).
3. Відкрий у браузері посилання, підставивши свій токен і своє слово (робиш сам, нікому не надсилай):
   `https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://kkujedghuxgtxmsbquqc.supabase.co/functions/v1/tg&secret_token=<СЛОВО>`
   Має з'явитися `"ok":true` і `Webhook was set`.
4. Перевір: напиши боту `/start`, він має відповісти кнопкою «🎰 Грати в Casino Victor».

## 6. Поповнення за Telegram Stars
1. SQL Editor → встав `docs/supabase-v9.sql` → **Run** (таблиця покупок).
2. Онови код функції `tg` новим текстом з `supabase/functions/tg/index.ts` → **Deploy**.
3. Вебхук з кроку 5 має бути вже налаштований. Більше нічого не треба: Stars не потребують платіжного провайдера.
Гроші за зірки приходять на баланс бота в Telegram (@BotFather → бот → Balance). Ігрові ₴ не можна виводити чи обмінювати на справжні гроші.
