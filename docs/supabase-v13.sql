-- Casino Victor v13: баланс і майно на сервері (однакові на телефоні й комп'ютері),
-- перекази й команди розробника доходять одразу, бан гравців, Автономера, Смертельна рулетка.
-- Запусти один раз у Supabase (SQL Editor → New query → встав увесь файл → Run) після docs/supabase-v12.sql.

-- 1. Стан гравця на сервері. Гра зберігає його сюди, а інші пристрої з тим самим кодом підтягують.
alter table public.profiles add column if not exists state jsonb;
alter table public.profiles add column if not exists state_rev bigint not null default 0;
alter table public.profiles add column if not exists banned_until timestamptz;
alter table public.profiles add column if not exists ban_note text;
alter table public.profiles add column if not exists plate text;

-- Код, бан і стан не можна змінити звичайним оновленням профілю: лише функціями нижче.
create or replace function public.lock_profile_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.code is distinct from old.code then new.code := old.code; end if;
  if current_setting('app.trusted', true) is distinct from 'on' then
    new.banned_until := old.banned_until;
    new.ban_note := old.ban_note;
    new.state := old.state;
    new.state_rev := old.state_rev;
    -- Номер у профілі показуємо лише свій і лише за 96 000 ₴.
    if new.plate is distinct from old.plate and new.plate is not null
      and not exists (select 1 from public.plates p where p.plate = new.plate and p.owner = new.id and p.value >= 9600000) then
      new.plate := old.plate;
    end if;
  end if;
  return new;
end $$;

create or replace function public.is_banned(uid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce((select banned_until > now() from public.profiles where id = uid), false);
$$;

-- Збереження з перевіркою версії: якщо інший пристрій (або переказ) уже змінив стан,
-- повертаємо серверний стан, і гра зливає зміни.
create or replace function public.save_state(p_state jsonb, p_rev bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if p is null then raise exception 'no_profile'; end if;
  if p.banned_until > now() then raise exception 'banned'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 200000 then raise exception 'bad_state'; end if;
  if p.state_rev <> p_rev then
    return jsonb_build_object('ok', false, 'rev', p.state_rev, 'state', p.state);
  end if;
  perform set_config('app.trusted', 'on', true);
  update public.profiles set
    state = p_state,
    state_rev = p.state_rev + 1,
    balance = greatest(0, coalesce(round((p_state->>'balance')::numeric)::bigint, balance)),
    level = coalesce((p_state->>'level')::int, level),
    owned = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_state->'owned', '[]'::jsonb)) x), '{}'),
    updated_at = now()
  where id = p.id;
  perform set_config('app.trusted', '', true);
  return jsonb_build_object('ok', true, 'rev', p.state_rev + 1);
end $$;

-- Новий стан, якщо версія змінилась (інакше лише ok). Заодно позначає, що гравець у мережі.
create or replace function public.load_state(p_rev bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p is null then raise exception 'no_profile'; end if;
  if p.updated_at < now() - interval '60 seconds' then
    update public.profiles set updated_at = now() where id = p.id;
  end if;
  return jsonb_build_object(
    'rev', p.state_rev,
    'state', case when p.state_rev = p_rev then null else p.state end,
    'banned_until', p.banned_until,
    'ban_note', p.ban_note
  );
end $$;

-- Зміна балансу в серверному стані (перекази, виграші дуелей, розробник).
create or replace function public.state_credit(uid uuid, amount bigint) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.trusted', 'on', true);
  update public.profiles set
    state = jsonb_set(state, '{balance}', to_jsonb(greatest(0, coalesce(round((state->>'balance')::numeric)::bigint, 0) + amount))),
    state_rev = state_rev + 1,
    balance = greatest(0, balance + amount)
  where id = uid and state is not null;
  perform set_config('app.trusted', '', true);
  return found;
end $$;

-- 2. Перекази зараховуються одразу в стан отримувача, навіть якщо він зараз не в грі.
alter table public.transfers add column if not exists applied boolean not null default false;

create or replace function public.apply_transfer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.amount > 0 and public.state_credit(new.receiver, new.amount) then new.applied := true; end if;
  return new;
end $$;
drop trigger if exists apply_transfer on public.transfers;
create trigger apply_transfer before insert on public.transfers for each row execute function public.apply_transfer();

-- Стара функція для старих версій гри: віддає лише те, що ще не зараховано.
create or replace function public.claim_transfers() returns bigint
language plpgsql security definer set search_path = public as $$
declare total bigint;
begin
  with c as (
    update public.transfers set claimed = true where receiver = auth.uid() and not claimed returning amount, applied
  )
  select coalesce(sum(amount) filter (where not applied), 0) into total from c;
  return total;
end $$;

-- Нова: credit — додати самій грі (стан ще не на сервері), total — показати сповіщення.
create or replace function public.claim_transfers2() returns jsonb
language plpgsql security definer set search_path = public as $$
declare credit bigint; total bigint;
begin
  with c as (
    update public.transfers set claimed = true where receiver = auth.uid() and not claimed returning amount, applied
  )
  select coalesce(sum(amount) filter (where not applied), 0), coalesce(sum(amount), 0) into credit, total from c;
  return jsonb_build_object('credit', credit, 'total', total);
end $$;

-- Забанений гравець не може дарувати.
create or replace function public.send_coins(p_to uuid, p_amount bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare tid bigint; sent_today bigint; unlimited boolean;
begin
  if public.is_banned(auth.uid()) then raise exception 'banned'; end if;
  if not public.are_friends(auth.uid(), p_to) then raise exception 'not_friends'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad_amount'; end if;
  select coalesce(code = '777777', false) into unlimited from public.profiles where id = auth.uid();
  if not coalesce(unlimited, false) then
    select coalesce(sum(t.amount), 0) into sent_today from public.transfers t
      where t.sender = auth.uid() and t.created_at > now() - interval '1 day';
    if sent_today + p_amount > 1000000 then raise exception 'daily_limit'; end if;
  end if;
  insert into public.transfers (sender, receiver, amount) values (auth.uid(), p_to, p_amount) returning id into tid;
  return tid;
end $$;

-- 3. Термінал розробника: зміни одразу в стані гравця; у черзі лишається сповіщення.
alter table public.admin_actions add column if not exists applied boolean not null default false;

drop function if exists public.admin_players(text);
create or replace function public.admin_players(p_query text default '') returns table (
  id uuid, code text, name text, balance bigint, level int, status text, owned text[], updated_at timestamptz,
  online boolean, banned_until timestamptz, ban_note text, plate text
)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return query
    select p.id, p.code, p.name, p.balance, p.level, p.status, p.owned, p.updated_at,
      p.updated_at > now() - interval '2 minutes', p.banned_until, p.ban_note, p.plate
    from public.profiles p
    where coalesce(p_query, '') = '' or p.code = upper(trim(p_query)) or p.name ilike '%' || trim(p_query) || '%'
    order by p.updated_at desc limit 50;
end $$;

create or replace function public.admin_stats() returns jsonb
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return jsonb_build_object(
    'players', (select count(*) from public.profiles),
    'online', (select count(*) from public.profiles where updated_at > now() - interval '2 minutes'),
    'today', (select count(*) from public.profiles where updated_at > now() - interval '1 day'),
    'banned', (select count(*) from public.profiles where banned_until > now()),
    'coins', (select coalesce(sum(balance), 0) from public.profiles)
  );
end $$;

drop function if exists public.admin_act(text, text, bigint, text, text);
create or replace function public.admin_act(p_code text, p_kind text, p_value bigint default null, p_item text default null, p_note text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; nm text; st jsonb; done boolean := false; lvl int; n int;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_kind = 'broadcast' then
    if coalesce(p_note, '') = '' then raise exception 'bad_amount'; end if;
    insert into public.admin_actions (user_id, kind, note, applied)
      select id, 'message', left(p_note, 300), true from public.profiles where updated_at > now() - interval '30 days';
    get diagnostics n = row_count;
    return n::text;
  end if;
  select id, name, state into uid, nm, st from public.profiles where code = upper(trim(p_code));
  if uid is null then raise exception 'not_found'; end if;
  if p_kind in ('balance_set', 'balance_add', 'balance_take', 'level_set', 'ban') and (p_value is null or p_value < 0) then raise exception 'bad_amount'; end if;

  perform set_config('app.trusted', 'on', true);
  if p_kind = 'ban' then
    -- p_value — хвилини, 0 — назавжди.
    update public.profiles set
      banned_until = case when p_value = 0 then 'infinity'::timestamptz else now() + make_interval(mins => p_value::int) end,
      ban_note = left(p_note, 200)
    where id = uid;
    done := true;
  elsif p_kind = 'unban' then
    update public.profiles set banned_until = null, ban_note = null where id = uid;
    insert into public.admin_actions (user_id, kind, note, applied) values (uid, 'message', 'Тебе розблоковано. Грай чесно!', true);
    perform set_config('app.trusted', '', true);
    return nm;
  elsif p_kind = 'rename' then
    if coalesce(trim(p_note), '') = '' then raise exception 'bad_amount'; end if;
    update public.profiles set name = left(trim(p_note), 24) where id = uid;
    insert into public.admin_actions (user_id, kind, note, applied) values (uid, 'message', 'Розробник змінив твоє ім’я на ' || left(trim(p_note), 24), true);
    perform set_config('app.trusted', '', true);
    return nm;
  elsif p_kind = 'friend_add' then
    if uid = auth.uid() then raise exception 'self'; end if;
    insert into public.friendships (user_id, friend_id) values (auth.uid(), uid), (uid, auth.uid()) on conflict do nothing;
    perform set_config('app.trusted', '', true);
    return nm;
  elsif st is not null then
    if p_kind = 'balance_set' then
      st := jsonb_set(st, '{balance}', to_jsonb(p_value));
    elsif p_kind = 'balance_add' then
      st := jsonb_set(st, '{balance}', to_jsonb(coalesce(round((st->>'balance')::numeric)::bigint, 0) + p_value));
    elsif p_kind = 'balance_take' then
      st := jsonb_set(st, '{balance}', to_jsonb(greatest(0, coalesce(round((st->>'balance')::numeric)::bigint, 0) - p_value)));
    elsif p_kind = 'item_give' and p_item is not null then
      if not coalesce(st->'owned', '[]'::jsonb) ? p_item then
        st := jsonb_set(st, '{owned}', coalesce(st->'owned', '[]'::jsonb) || to_jsonb(p_item));
      end if;
    elsif p_kind = 'item_take' and p_item is not null then
      st := jsonb_set(st, '{owned}', coalesce((select jsonb_agg(x) from jsonb_array_elements_text(coalesce(st->'owned', '[]'::jsonb)) x where x <> p_item), '[]'::jsonb));
    elsif p_kind = 'level_set' then
      lvl := greatest(1, least(100, p_value::int));
      st := jsonb_set(jsonb_set(st, '{level}', to_jsonb(lvl)), '{xp}', to_jsonb(round(1000 * power(lvl - 1, 1.9))::bigint));
    elsif p_kind = 'reset' then
      st := jsonb_build_object('balance', 30000, 'resetAt', floor(extract(epoch from now()) * 1000)::bigint);
    end if;
    if p_kind <> 'message' then
      update public.profiles set
        state = st,
        state_rev = state_rev + 1,
        balance = greatest(0, coalesce(round((st->>'balance')::numeric)::bigint, 0)),
        level = coalesce((st->>'level')::int, 1),
        owned = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(st->'owned', '[]'::jsonb)) x), '{}')
      where id = uid;
      done := true;
    end if;
  end if;
  perform set_config('app.trusted', '', true);
  -- Сповіщення (або сама команда, якщо гравець ще на старій версії гри).
  if p_kind <> 'ban' then
    insert into public.admin_actions (user_id, kind, value, item, note, applied) values (uid, p_kind, p_value, p_item, p_note, done);
  end if;
  return nm;
end $$;

-- Старі версії гри отримують лише незастосовані команди; нові — усі, щоб показати сповіщення.
create or replace function public.take_admin_actions() returns setof public.admin_actions
language sql security definer set search_path = public as $$
  with d as (delete from public.admin_actions where user_id = auth.uid() returning *)
  select * from d where not applied order by id;
$$;
create or replace function public.take_admin_actions2() returns setof public.admin_actions
language sql security definer set search_path = public as $$
  with d as (delete from public.admin_actions where user_id = auth.uid() returning *)
  select * from d order by id;
$$;

-- 4. Автономера: кожен номер існує лише в одного гравця.
create table if not exists public.plates (
  plate text primary key,
  owner uuid not null references public.profiles(id) on delete cascade,
  value bigint not null check (value > 0),
  created_at timestamptz not null default now()
);
create index if not exists plates_owner on public.plates (owner);
alter table public.plates enable row level security;
drop policy if exists "plates read" on public.plates;
create policy "plates read" on public.plates for select to authenticated using (true);

create or replace function public.plate_reserve(p_plate text, p_value bigint) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if public.is_banned(auth.uid()) then raise exception 'banned'; end if;
  if p_plate !~ '^([A-ZА-ЯІЇЄ]{2} [0-9]{4} [A-ZА-ЯІЇЄ]{2}|АУЕ|VIKTOR|МВС|ВОР|ВАСИЛЬ)$' then raise exception 'bad_plate'; end if;
  if p_value not in (100000, 480000, 1200000, 1800000, 6000000, 9600000) then raise exception 'bad_plate'; end if;
  insert into public.plates (plate, owner, value) values (p_plate, auth.uid(), p_value) on conflict do nothing;
  return found;
end $$;

-- Продаж звільняє номер: його знову може виграти будь-хто.
create or replace function public.plate_release(p_plate text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from public.plates where plate = p_plate and owner = auth.uid();
  if not found then return false; end if;
  perform set_config('app.trusted', 'on', true);
  update public.profiles set plate = null where id = auth.uid() and plate = p_plate;
  perform set_config('app.trusted', '', true);
  return true;
end $$;

-- 5. Смертельна рулетка (дуель). Хто ходить і чи вистрілив револьвер, вирішує сервер.
create table if not exists public.roulette_tables (
  id bigint generated always as identity primary key,
  duel_id bigint unique references public.duels(id) on delete set null,
  a uuid not null references public.profiles(id) on delete cascade, -- той, хто викликав
  b uuid not null references public.profiles(id) on delete cascade,
  stake bigint not null,
  coin smallint not null, -- хто виграв монетку: 0 — a, 1 — b
  holder smallint not null, -- у кого револьвер
  shots smallint not null default 0, -- скільки разів уже натиснули на курок
  last text, -- 'shoot' | 'self' | 'shoot_fire' | 'self_fire' | 'timeout'
  bonus_a bigint not null default 0,
  bonus_b bigint not null default 0,
  winner smallint,
  status text not null default 'playing' check (status in ('playing', 'finished')),
  version int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.roulette_tables enable row level security;
drop policy if exists "roulette read" on public.roulette_tables;
create policy "roulette read" on public.roulette_tables for select to authenticated using (a = auth.uid() or b = auth.uid());

create or replace function public.roulette_settle(p_id bigint, p_winner smallint, p_last text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.roulette_tables;
begin
  select * into t from public.roulette_tables where id = p_id;
  update public.roulette_tables set status = 'finished', winner = p_winner, last = p_last, version = version + 1, updated_at = now() where id = p_id;
  insert into public.transfers (sender, receiver, amount) values (null, case when p_winner = 0 then t.a else t.b end, t.stake * 2);
  if t.duel_id is not null then
    update public.duels set
      status = 'finished',
      challenger_score = case when p_winner = 0 then 1 else 0 end,
      opponent_score = case when p_winner = 1 then 1 else 0 end,
      winner = case when p_winner = 0 then t.a else t.b end,
      updated_at = now()
    where id = t.duel_id;
  end if;
end $$;

-- Відкриває стіл для прийнятої дуелі (або повертає вже відкритий). Монетку кидає сервер.
create or replace function public.roulette_open(p_duel bigint) returns public.roulette_tables
language plpgsql security definer set search_path = public as $$
declare d public.duels; t public.roulette_tables; c smallint;
begin
  select * into t from public.roulette_tables where duel_id = p_duel;
  if t.id is not null then
    if auth.uid() not in (t.a, t.b) then raise exception 'duel_closed'; end if;
    return t;
  end if;
  select * into d from public.duels where id = p_duel for update;
  if d is null or d.status <> 'accepted' or d.game <> 'roulette' or auth.uid() not in (d.challenger, d.opponent) then raise exception 'duel_closed'; end if;
  c := floor(random() * 2)::smallint;
  insert into public.roulette_tables (duel_id, a, b, stake, coin, holder)
    values (p_duel, d.challenger, d.opponent, d.stake, c, c)
    on conflict (duel_id) do nothing returning * into t;
  if t.id is null then select * into t from public.roulette_tables where duel_id = p_duel; end if;
  return t;
end $$;

-- Постріл. p_self — у себе. Куля в одній з 6 камор: шанс 1 / (6 − уже натиснуто).
create or replace function public.roulette_act(p_id bigint, p_version int, p_self boolean) returns public.roulette_tables
language plpgsql security definer set search_path = public as $$
declare t public.roulette_tables; seat smallint; fire boolean;
begin
  select * into t from public.roulette_tables where id = p_id for update;
  if t is null or t.status <> 'playing' then raise exception 'duel_closed'; end if;
  if t.a = auth.uid() then seat := 0; elsif t.b = auth.uid() then seat := 1; else raise exception 'duel_closed'; end if;
  if t.holder <> seat then raise exception 'durak_turn'; end if;
  if t.version <> p_version then raise exception 'durak_stale'; end if;
  fire := random() < 1.0 / (6 - least(t.shots, 5));
  if fire then
    perform public.roulette_settle(p_id, case when p_self then (1 - seat)::smallint else seat end, case when p_self then 'self_fire' else 'shoot_fire' end);
  elsif p_self then
    -- Порожньо: револьвер переходить супернику (класична російська рулетка).
    update public.roulette_tables set shots = shots + 1, holder = 1 - seat, last = 'self', version = version + 1, updated_at = now() where id = p_id;
  else
    update public.roulette_tables set shots = shots + 1, holder = 1 - seat, last = 'shoot', version = version + 1, updated_at = now() where id = p_id;
  end if;
  select * into t from public.roulette_tables where id = p_id;
  return t;
end $$;

-- Суперник не ходить 45 секунд: перемога тому, хто чекає.
create or replace function public.roulette_claim(p_id bigint) returns public.roulette_tables
language plpgsql security definer set search_path = public as $$
declare t public.roulette_tables; seat smallint;
begin
  select * into t from public.roulette_tables where id = p_id for update;
  if t is null or t.status <> 'playing' then raise exception 'duel_closed'; end if;
  if t.a = auth.uid() then seat := 0; elsif t.b = auth.uid() then seat := 1; else raise exception 'duel_closed'; end if;
  if t.holder = seat or t.updated_at > now() - interval '45 seconds' then raise exception 'durak_wait'; end if;
  perform public.roulette_settle(p_id, seat, 'timeout');
  select * into t from public.roulette_tables where id = p_id;
  return t;
end $$;

-- Як у v11, плюс рулетка: її дуель закриває стіл, а не таймер на 100 секунд.
create or replace function public.settle_duels() returns void
language plpgsql security definer set search_path = public as $$
declare d public.duels; t public.roulette_tables;
begin
  for d in select * from public.duels
    where status = 'pending' and created_at < now() - interval '60 seconds' for update skip locked
  loop
    update public.duels set status = 'cancelled', updated_at = now() where id = d.id;
    insert into public.transfers (sender, receiver, amount) values (null, d.challenger, d.stake);
  end loop;
  for d in select * from public.duels
    where status = 'accepted' and game not in ('durak', 'roulette') and accepted_at < now() - interval '100 seconds' for update skip locked
  loop
    perform public.finish_duel(d.id, coalesce(d.challenger_score, 0), coalesce(d.opponent_score, 0));
  end loop;
  for d in select * from public.duels du
    where du.status = 'accepted' and du.game in ('durak', 'roulette') and du.accepted_at < now() - interval '5 minutes'
      and not exists (select 1 from public.durak_tables t where t.duel_id = du.id)
      and not exists (select 1 from public.roulette_tables r where r.duel_id = du.id)
    for update skip locked
  loop
    perform public.finish_duel(d.id, 0, 0);
  end loop;
  -- Рулетка, яку кинули обидва: через 3 хвилини без ходу програє той, у кого револьвер.
  for t in select * from public.roulette_tables where status = 'playing' and updated_at < now() - interval '3 minutes' for update skip locked loop
    perform public.roulette_settle(t.id, (1 - t.holder)::smallint, 'timeout');
  end loop;
end $$;

revoke execute on function public.is_banned(uuid) from anon;
revoke execute on function public.save_state(jsonb, bigint) from anon;
revoke execute on function public.load_state(bigint) from anon;
revoke execute on function public.state_credit(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.apply_transfer() from public, anon, authenticated;
revoke execute on function public.claim_transfers2() from anon;
revoke execute on function public.admin_players(text) from anon;
revoke execute on function public.admin_stats() from anon;
revoke execute on function public.admin_act(text, text, bigint, text, text) from anon;
revoke execute on function public.take_admin_actions2() from anon;
revoke execute on function public.plate_reserve(text, bigint) from anon;
revoke execute on function public.plate_release(text) from anon;
revoke execute on function public.roulette_settle(bigint, smallint, text) from public, anon, authenticated;
revoke execute on function public.roulette_open(bigint) from anon;
revoke execute on function public.roulette_act(bigint, int, boolean) from anon;
revoke execute on function public.roulette_claim(bigint) from anon;
