-- Casino Victor v8: гравець з кодом 777777 (адмін) дарує без добового ліміту.
-- Запусти один раз у Supabase (SQL Editor → New query → Run).

create or replace function public.send_coins(p_to uuid, p_amount bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare tid bigint; sent_today bigint; unlimited boolean;
begin
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
revoke execute on function public.send_coins(uuid, bigint) from anon;
