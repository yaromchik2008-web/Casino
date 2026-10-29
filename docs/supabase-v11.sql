-- Casino Victor v11: дуель у дурака з другом.
-- Запусти один раз у Supabase (SQL Editor → New query → Run) після docs/supabase-v10.sql.
-- Ставки знімає система дуелей; гра йде за столом дурака, а результат закриває дуель.

alter table public.durak_tables add column if not exists duel_id bigint unique references public.duels(id) on delete set null;

-- Той, хто прийняв виклик, роздає карти і відкриває стіл для обох.
create or replace function public.durak_duel_start(p_duel bigint, p_state jsonb, p_turn smallint) returns void
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  select * into d from public.duels where id = p_duel for update;
  if d is null or d.status <> 'accepted' or d.game <> 'durak' then raise exception 'duel_closed'; end if;
  if d.opponent <> auth.uid() then raise exception 'duel_closed'; end if;
  if exists (select 1 from public.durak_tables where duel_id = p_duel) then raise exception 'durak_taken'; end if;
  insert into public.durak_tables (host, guest, stake, deck_size, status, state, version, turn, duel_id)
    values (d.challenger, d.opponent, d.stake, 36, 'playing', p_state, 1, p_turn, p_duel);
end $$;

-- Як у v10, плюс закриття дуелі, якщо стіл був дуельним.
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
  if t.duel_id is not null then
    update public.duels set
      status = 'finished',
      challenger_score = case when p_loser = 1 then 1 else 0 end,
      opponent_score = case when p_loser = 0 then 1 else 0 end,
      winner = case when p_loser = 0 then t.guest when p_loser = 1 then t.host else null end,
      updated_at = now()
    where id = t.duel_id;
  end if;
end $$;

-- Як у v3, але дуелі в дурака не закриваються за 100 секунд: їх закриває стіл.
-- Якщо стіл так і не відкрився за 5 хвилин, ставки повертаються.
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
    where status = 'accepted' and game <> 'durak' and accepted_at < now() - interval '100 seconds' for update skip locked
  loop
    perform public.finish_duel(d.id, coalesce(d.challenger_score, 0), coalesce(d.opponent_score, 0));
  end loop;
  for d in select * from public.duels du
    where du.status = 'accepted' and du.game = 'durak' and du.accepted_at < now() - interval '5 minutes'
      and not exists (select 1 from public.durak_tables t where t.duel_id = du.id)
    for update skip locked
  loop
    perform public.finish_duel(d.id, 0, 0);
  end loop;
end $$;

revoke execute on function public.durak_settle(bigint, smallint) from public, anon, authenticated;
revoke execute on function public.durak_duel_start(bigint, jsonb, smallint) from anon;
