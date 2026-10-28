-- Casino Victor: дуелі з другом. Запусти один раз у Supabase (SQL Editor → New query → Run)
-- після docs/supabase.sql. Суми в копійках ігрових гривень.

-- Виплати від гри (повернення ставки, виграш дуелі) йдуть переказом без відправника.
alter table public.transfers alter column sender drop not null;

create table if not exists public.duels (
  id bigint generated always as identity primary key,
  challenger uuid not null references public.profiles(id) on delete cascade,
  opponent uuid not null references public.profiles(id) on delete cascade,
  game text not null check (char_length(game) between 1 and 40),
  stake bigint not null check (stake >= 100 and stake <= 1000000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'finished')),
  challenger_score bigint,
  opponent_score bigint,
  winner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists duels_challenger on public.duels (challenger, created_at desc);
create index if not exists duels_opponent on public.duels (opponent, created_at desc);
alter table public.duels enable row level security;
drop policy if exists "duels read own" on public.duels;
create policy "duels read own" on public.duels for select to authenticated
  using (challenger = auth.uid() or opponent = auth.uid());

-- Виклик: ставку гравець уже зняв у себе в грі, тут лише запис.
create or replace function public.create_duel(p_opponent uuid, p_game text, p_stake bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare did bigint; open_count int;
begin
  if not public.are_friends(auth.uid(), p_opponent) then raise exception 'not_friends'; end if;
  select count(*) into open_count from public.duels
    where challenger = auth.uid() and status in ('pending', 'accepted');
  if open_count >= 10 then raise exception 'too_many_duels'; end if;
  insert into public.duels (challenger, opponent, game, stake)
    values (auth.uid(), p_opponent, p_game, p_stake) returning id into did;
  return did;
end $$;

-- Відповідь суперника. Відмова повертає ставку тому, хто викликав.
create or replace function public.respond_duel(p_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  select * into d from public.duels where id = p_id for update;
  if d is null or d.opponent <> auth.uid() or d.status <> 'pending' then raise exception 'duel_closed'; end if;
  if p_accept then
    update public.duels set status = 'accepted', updated_at = now() where id = p_id;
  else
    update public.duels set status = 'declined', updated_at = now() where id = p_id;
    insert into public.transfers (sender, receiver, amount) values (null, d.challenger, d.stake);
  end if;
end $$;

create or replace function public.cancel_duel(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  select * into d from public.duels where id = p_id for update;
  if d is null or d.challenger <> auth.uid() or d.status <> 'pending' then raise exception 'duel_closed'; end if;
  update public.duels set status = 'cancelled', updated_at = now() where id = p_id;
  insert into public.transfers (sender, receiver, amount) values (null, d.challenger, d.stake);
end $$;

-- Результат раунду. Коли є обидва, переможець забирає подвійну ставку; нічия лишається в казні гри.
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
    if d.challenger_score > d.opponent_score then
      update public.duels set status = 'finished', winner = d.challenger where id = p_id;
      insert into public.transfers (sender, receiver, amount) values (null, d.challenger, d.stake * 2);
    elsif d.opponent_score > d.challenger_score then
      update public.duels set status = 'finished', winner = d.opponent where id = p_id;
      insert into public.transfers (sender, receiver, amount) values (null, d.opponent, d.stake * 2);
    else
      update public.duels set status = 'finished', winner = null where id = p_id;
    end if;
  end if;
end $$;

revoke execute on function public.create_duel(uuid, text, bigint) from anon;
revoke execute on function public.respond_duel(bigint, boolean) from anon;
revoke execute on function public.cancel_duel(bigint) from anon;
revoke execute on function public.submit_duel_score(bigint, bigint) from anon;
