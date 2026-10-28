-- Casino Victor v3: таймер дуелей, таблиця лідерів, турнір на 6 годин, сповіщення в боті.
-- Запусти один раз у Supabase (SQL Editor → New query → Run) після docs/supabase.sql і docs/supabase-duels.sql.
-- Суми в копійках ігрових гривень.

create extension if not exists pg_net;

-- ───────────── Дуелі: виклик живе 1 хвилину, раунд 1 хвилину ─────────────
alter table public.duels add column if not exists accepted_at timestamptz;
alter table public.duels add column if not exists notified boolean not null default false;

-- Закриває прострочені дуелі: неприйнятий виклик повертає ставку, незіграний раунд рахується як 0.
create or replace function public.settle_duels() returns void
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  for d in select * from public.duels
    where status = 'pending' and created_at < now() - interval '60 seconds' for update skip locked
  loop
    update public.duels set status = 'cancelled', updated_at = now() where id = d.id;
    insert into public.transfers (sender, receiver, amount) values (null, d.challenger, d.stake);
  end loop;
  for d in select * from public.duels
    where status = 'accepted' and accepted_at < now() - interval '100 seconds' for update skip locked
  loop
    perform public.finish_duel(d.id, coalesce(d.challenger_score, 0), coalesce(d.opponent_score, 0));
  end loop;
end $$;

create or replace function public.finish_duel(p_id bigint, cs bigint, os bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  select * into d from public.duels where id = p_id;
  if cs > os then
    update public.duels set status = 'finished', challenger_score = cs, opponent_score = os, winner = d.challenger, updated_at = now() where id = p_id;
    insert into public.transfers (sender, receiver, amount) values (null, d.challenger, d.stake * 2);
  elsif os > cs then
    update public.duels set status = 'finished', challenger_score = cs, opponent_score = os, winner = d.opponent, updated_at = now() where id = p_id;
    insert into public.transfers (sender, receiver, amount) values (null, d.opponent, d.stake * 2);
  else
    -- Нічия: ставки лишаються в казні гри.
    update public.duels set status = 'finished', challenger_score = cs, opponent_score = os, winner = null, updated_at = now() where id = p_id;
  end if;
end $$;

create or replace function public.respond_duel(p_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  perform public.settle_duels();
  select * into d from public.duels where id = p_id for update;
  if d is null or d.opponent <> auth.uid() or d.status <> 'pending' then raise exception 'duel_closed'; end if;
  if p_accept then
    update public.duels set status = 'accepted', accepted_at = now(), updated_at = now() where id = p_id;
  else
    update public.duels set status = 'declined', updated_at = now() where id = p_id;
    insert into public.transfers (sender, receiver, amount) values (null, d.challenger, d.stake);
  end if;
end $$;

create or replace function public.submit_duel_score(p_id bigint, p_score bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  select * into d from public.duels where id = p_id for update;
  if d is null or d.status <> 'accepted' then raise exception 'duel_closed'; end if;
  if d.challenger = auth.uid() and d.challenger_score is null then
    update public.duels set challenger_score = greatest(p_score, 0), updated_at = now() where id = p_id;
  elsif d.opponent = auth.uid() and d.opponent_score is null then
    update public.duels set opponent_score = greatest(p_score, 0), updated_at = now() where id = p_id;
  else
    raise exception 'already_played';
  end if;
  select * into d from public.duels where id = p_id;
  if d.challenger_score is not null and d.opponent_score is not null then
    perform public.finish_duel(p_id, d.challenger_score, d.opponent_score);
  end if;
end $$;

-- ───────────── Таблиця лідерів ─────────────
create or replace function public.leaderboard() returns table (id uuid, name text, balance bigint, level int, status text, rank bigint)
language sql security definer set search_path = public stable as $$
  select p.id, p.name, p.balance::bigint, p.level::int, p.status, row_number() over (order by p.balance desc, p.id)
  from public.profiles p
  order by p.balance desc, p.id
  limit 50;
$$;

create or replace function public.my_rank() returns bigint
language sql security definer set search_path = public stable as $$
  select count(*) + 1 from public.profiles
  where balance > (select balance from public.profiles where id = auth.uid());
$$;

-- ───────────── Турнір на 6 годин: вхід 200 ₴, хто більше заробив, забирає всі внески ─────────────
-- Номер раунду = кількість 6-годинних проміжків від 1970 року (UTC): старт о 02:00, 08:00, 14:00, 20:00 за Києвом взимку.

create table if not exists public.tourney_entries (
  round bigint not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  earned bigint not null default 0,
  joined_at timestamptz not null default now(),
  primary key (round, user_id)
);
alter table public.tourney_entries enable row level security;

create table if not exists public.tourney_results (
  round bigint primary key,
  winner uuid references public.profiles(id) on delete set null,
  pool bigint not null,
  players int not null,
  settled_at timestamptz not null default now()
);
alter table public.tourney_results enable row level security;
drop policy if exists "tourney results read" on public.tourney_results;
create policy "tourney results read" on public.tourney_results for select to authenticated using (true);

create or replace function public.settle_tourneys() returns void
language plpgsql security definer set search_path = public as $$
declare r record; w uuid; cnt int;
begin
  for r in select distinct e.round from public.tourney_entries e
    where e.round < floor(extract(epoch from now()) / 21600)
      and not exists (select 1 from public.tourney_results t where t.round = e.round)
  loop
    select user_id into w from public.tourney_entries where round = r.round order by earned desc, joined_at asc limit 1;
    select count(*) into cnt from public.tourney_entries where round = r.round;
    insert into public.tourney_results (round, winner, pool, players) values (r.round, w, cnt * 20000, cnt)
      on conflict do nothing;
    if found then
      insert into public.transfers (sender, receiver, amount) values (null, w, cnt * 20000);
    end if;
  end loop;
end $$;

-- Вступ: внесок 200 ₴ гравець уже зняв у себе в грі.
create or replace function public.join_tourney() returns bigint
language plpgsql security definer set search_path = public as $$
declare rnd bigint := floor(extract(epoch from now()) / 21600);
begin
  perform public.settle_tourneys();
  insert into public.tourney_entries (round, user_id) values (rnd, auth.uid());
  return rnd;
exception when unique_violation then
  raise exception 'already_joined';
end $$;

create or replace function public.report_tourney(p_round bigint, p_earned bigint) returns void
language sql security definer set search_path = public as $$
  update public.tourney_entries set earned = least(p_earned, 100000000)
  where round = p_round and user_id = auth.uid() and p_round = floor(extract(epoch from now()) / 21600);
$$;

create or replace function public.tourney_board(p_round bigint) returns table (id uuid, name text, earned bigint)
language sql security definer set search_path = public stable as $$
  select p.id, p.name, e.earned from public.tourney_entries e join public.profiles p on p.id = e.user_id
  where e.round = p_round order by e.earned desc, e.joined_at asc limit 100;
$$;

-- ───────────── Сповіщення в Telegram-боті ─────────────
-- Telegram id гравця. Читати можуть лише сервер і функція бота.
create table if not exists public.tg_links (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tg_id bigint not null,
  updated_at timestamptz not null default now()
);
alter table public.tg_links enable row level security;

alter table public.messages add column if not exists notified boolean not null default false;
alter table public.transfers add column if not exists notified boolean not null default false;

-- Після нового повідомлення, подарунка чи виклику на дуель будимо функцію бота.
-- Вона сама перечитує запис, тому в запиті немає нічого секретного.
create or replace function public.ping_bot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://kkujedghuxgtxmsbquqc.supabase.co/functions/v1/tg',
    body := jsonb_build_object('table', tg_table_name, 'id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new; -- сповіщення не мають ламати гру
end $$;

drop trigger if exists ping_bot_messages on public.messages;
create trigger ping_bot_messages after insert on public.messages for each row execute function public.ping_bot();
drop trigger if exists ping_bot_transfers on public.transfers;
create trigger ping_bot_transfers after insert on public.transfers for each row
  when (new.sender is not null) execute function public.ping_bot();
drop trigger if exists ping_bot_duels on public.duels;
create trigger ping_bot_duels after insert on public.duels for each row execute function public.ping_bot();

revoke execute on function public.settle_duels() from anon;
revoke execute on function public.finish_duel(bigint, bigint, bigint) from anon, authenticated;
revoke execute on function public.leaderboard() from anon;
revoke execute on function public.my_rank() from anon;
revoke execute on function public.settle_tourneys() from anon;
revoke execute on function public.join_tourney() from anon;
revoke execute on function public.report_tourney(bigint, bigint) from anon;
revoke execute on function public.tourney_board(bigint) from anon;
revoke execute on function public.ping_bot() from anon, authenticated;
