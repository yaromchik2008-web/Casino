-- Casino Victor v6: нічия в дуелі повертає обом ставку.
-- Запусти один раз у Supabase (SQL Editor → New query → Run) після docs/supabase-v3.sql.

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
    -- Нічия: кожен отримує свою ставку назад.
    update public.duels set status = 'finished', challenger_score = cs, opponent_score = os, winner = null, updated_at = now() where id = p_id;
    insert into public.transfers (sender, receiver, amount) values (null, d.challenger, d.stake), (null, d.opponent, d.stake);
  end if;
end $$;

revoke execute on function public.finish_duel(bigint, bigint, bigint) from anon, authenticated;
