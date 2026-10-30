-- Casino Victor v14: у «Смертельній рулетці» після пострілу «в себе» револьвер теж переходить супернику.
-- Запусти один раз у Supabase (SQL Editor → New query → Run) після docs/supabase-v13.sql.

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
    -- Порожньо в себе: +10 ₴ сміливцю, і револьвер переходить супернику.
    insert into public.transfers (sender, receiver, amount) values (null, auth.uid(), 1000);
    update public.roulette_tables set shots = shots + 1, holder = 1 - seat, last = 'self', version = version + 1, updated_at = now(),
      bonus_a = bonus_a + case when seat = 0 then 1000 else 0 end, bonus_b = bonus_b + case when seat = 1 then 1000 else 0 end
    where id = p_id;
  else
    update public.roulette_tables set shots = shots + 1, holder = 1 - seat, last = 'shoot', version = version + 1, updated_at = now() where id = p_id;
  end if;
  select * into t from public.roulette_tables where id = p_id;
  return t;
end $$;
