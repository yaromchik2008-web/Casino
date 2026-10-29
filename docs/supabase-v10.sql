-- Casino Victor v10: онлайн-дурак з іншими гравцями.
-- Запусти один раз у Supabase (SQL Editor → New query → Run) після попередніх файлів.
-- Ставку гравець знімає в себе в грі; виплати (повернення, виграш) приходять переказом без відправника.

create table if not exists public.durak_tables (
  id bigint generated always as identity primary key,
  host uuid not null references public.profiles(id) on delete cascade,
  guest uuid references public.profiles(id) on delete cascade,
  stake bigint not null check (stake >= 100 and stake <= 1000000),
  deck_size int not null check (deck_size in (36, 54)),
  status text not null default 'open' check (status in ('open', 'playing', 'finished', 'cancelled')),
  state jsonb,
  version int not null default 0,
  turn smallint, -- 0 — господар столу, 1 — гість
  loser smallint, -- хто дурак; -1 — нічия
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists durak_open on public.durak_tables (status, created_at desc);
create index if not exists durak_host on public.durak_tables (host, created_at desc);
create index if not exists durak_guest on public.durak_tables (guest, created_at desc);
alter table public.durak_tables enable row level security;
drop policy if exists "durak read" on public.durak_tables;
create policy "durak read" on public.durak_tables for select to authenticated
  using (status = 'open' or host = auth.uid() or guest = auth.uid());

-- Виплата за кінець гри: переможець забирає обидві ставки, нічия повертає кожному його ставку.
create or replace function public.durak_settle(p_id bigint, p_loser smallint) returns void
language plpgsql security definer set search_path = public as $$
declare t public.durak_tables;
begin
  select * into t from public.durak_tables where id = p_id;
  update public.durak_tables set status = 'finished', loser = p_loser, turn = null, updated_at = now() where id = p_id;
  if p_loser = -1 then
    insert into public.transfers (sender, receiver, amount) values (null, t.host, t.stake), (null, t.guest, t.stake);
  elsif p_loser = 0 then
    insert into public.transfers (sender, receiver, amount) values (null, t.guest, t.stake * 2);
  else
    insert into public.transfers (sender, receiver, amount) values (null, t.host, t.stake * 2);
  end if;
end $$;

-- Прибирає старі столи: нікого не дочекались за 15 хв — повертаємо ставку;
-- гра стоїть 10 хв — програє той, чий був хід.
create or replace function public.durak_expire() returns void
language plpgsql security definer set search_path = public as $$
declare t public.durak_tables;
begin
  for t in select * from public.durak_tables where status = 'open' and created_at < now() - interval '15 minutes' for update loop
    update public.durak_tables set status = 'cancelled', updated_at = now() where id = t.id;
    insert into public.transfers (sender, receiver, amount) values (null, t.host, t.stake);
  end loop;
  for t in select * from public.durak_tables where status = 'playing' and updated_at < now() - interval '10 minutes' for update loop
    perform public.durak_settle(t.id, coalesce(t.turn, -1)::smallint);
  end loop;
end $$;

create or replace function public.durak_create(p_stake bigint, p_deck int) returns bigint
language plpgsql security definer set search_path = public as $$
declare tid bigint;
begin
  perform public.durak_expire();
  if exists (select 1 from public.durak_tables where (host = auth.uid() or guest = auth.uid()) and status in ('open', 'playing')) then
    raise exception 'durak_busy';
  end if;
  insert into public.durak_tables (host, stake, deck_size) values (auth.uid(), p_stake, p_deck) returning id into tid;
  return tid;
end $$;

create or replace function public.durak_cancel(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare t public.durak_tables;
begin
  select * into t from public.durak_tables where id = p_id for update;
  if t is null or t.host <> auth.uid() or t.status <> 'open' then raise exception 'durak_closed'; end if;
  update public.durak_tables set status = 'cancelled', updated_at = now() where id = p_id;
  insert into public.transfers (sender, receiver, amount) values (null, t.host, t.stake);
end $$;

-- Відкриті столи інших гравців з іменами господарів.
create or replace function public.durak_lobby()
returns table (id bigint, host uuid, host_name text, stake bigint, deck_size int, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public.durak_expire();
  return query
    select t.id, t.host, p.name, t.stake, t.deck_size, t.created_at
    from public.durak_tables t join public.profiles p on p.id = t.host
    where t.status = 'open' and t.host <> auth.uid()
    order by t.created_at desc limit 30;
end $$;

-- Гість сідає за стіл і приносить роздачу.
create or replace function public.durak_join(p_id bigint, p_state jsonb, p_turn smallint) returns void
language plpgsql security definer set search_path = public as $$
declare t public.durak_tables;
begin
  select * into t from public.durak_tables where id = p_id for update;
  if t is null or t.status <> 'open' or t.guest is not null then raise exception 'durak_taken'; end if;
  if t.host = auth.uid() then raise exception 'durak_self'; end if;
  if exists (select 1 from public.durak_tables where (host = auth.uid() or guest = auth.uid()) and status in ('open', 'playing')) then
    raise exception 'durak_busy';
  end if;
  update public.durak_tables
    set guest = auth.uid(), status = 'playing', state = p_state, turn = p_turn, version = 1, updated_at = now()
    where id = p_id;
end $$;

-- Хід. Хто ходить, перевіряє сервер; p_loser — коли гра закінчилась (або гравець здається).
create or replace function public.durak_move(p_id bigint, p_version int, p_state jsonb, p_turn smallint, p_loser smallint)
returns void
language plpgsql security definer set search_path = public as $$
declare t public.durak_tables; seat smallint;
begin
  select * into t from public.durak_tables where id = p_id for update;
  if t is null or t.status <> 'playing' then raise exception 'durak_closed'; end if;
  if t.host = auth.uid() then seat := 0; elsif t.guest = auth.uid() then seat := 1; else raise exception 'durak_closed'; end if;
  if t.version <> p_version then raise exception 'durak_stale'; end if;
  -- Здатися можна будь-коли, ходити — лише у свою чергу.
  if p_loser is distinct from seat and t.turn is distinct from seat then raise exception 'durak_turn'; end if;
  if p_loser is not null and p_loser <> seat then
    -- Виграти можна лише скинувши всі карти, коли колода закінчилась.
    if jsonb_array_length(coalesce(p_state->'deck', '[]')) > 0
       or jsonb_array_length(coalesce(p_state->'hands'->seat, '[]')) > 0 then
      raise exception 'durak_bad';
    end if;
  end if;
  update public.durak_tables set state = p_state, turn = p_turn, version = version + 1, updated_at = now() where id = p_id;
  if p_loser is not null then perform public.durak_settle(p_id, p_loser); end if;
end $$;

-- Суперник не ходить понад хвилину — перемога за тим, хто чекає.
create or replace function public.durak_claim(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare t public.durak_tables; seat smallint;
begin
  select * into t from public.durak_tables where id = p_id for update;
  if t is null or t.status <> 'playing' then raise exception 'durak_closed'; end if;
  if t.host = auth.uid() then seat := 0; elsif t.guest = auth.uid() then seat := 1; else raise exception 'durak_closed'; end if;
  if t.turn is null or t.turn = seat or t.updated_at > now() - interval '60 seconds' then raise exception 'durak_wait'; end if;
  perform public.durak_settle(p_id, t.turn);
end $$;

revoke execute on function public.durak_settle(bigint, smallint) from public, anon, authenticated;
revoke execute on function public.durak_expire() from anon;
revoke execute on function public.durak_create(bigint, int) from anon;
revoke execute on function public.durak_cancel(bigint) from anon;
revoke execute on function public.durak_lobby() from anon;
revoke execute on function public.durak_join(bigint, jsonb, smallint) from anon;
revoke execute on function public.durak_move(bigint, int, jsonb, smallint, smallint) from anon;
revoke execute on function public.durak_claim(bigint) from anon;
