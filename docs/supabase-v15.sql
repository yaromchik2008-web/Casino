-- Casino Victor v15: захист від накрутки грошей.
-- Запусти один раз у Supabase (SQL Editor → New query → встав увесь файл → Run) після docs/supabase-v14.sql.

-- 1. Баланс, майно й рівень у профілі змінює лише сервер (раніше їх можна було переписати запитом з браузера).
create or replace function public.lock_profile_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.code is distinct from old.code then new.code := old.code; end if;
  if current_setting('app.trusted', true) is distinct from 'on' then
    new.banned_until := old.banned_until;
    new.ban_note := old.ban_note;
    new.state := old.state;
    new.state_rev := old.state_rev;
    new.balance := old.balance;
    new.owned := old.owned;
    if new.level > old.level + 1 then new.level := old.level; end if;
    -- Номер у профілі показуємо лише свій і лише за 96 000 ₴.
    if new.plate is distinct from old.plate and new.plate is not null
      and not exists (select 1 from public.plates p where p.plate = new.plate and p.owner = new.id and p.value >= 9600000) then
      new.plate := old.plate;
    end if;
  end if;
  return new;
end $$;

-- Скільки гравець має на сервері зараз.
create or replace function public.server_balance(uid uuid) returns bigint
language sql security definer set search_path = public stable as $$
  select coalesce(round((state->>'balance')::numeric)::bigint, balance, 0) from public.profiles where id = uid;
$$;

-- 2. Ліміт виграшу: за годину баланс може вирости не більше ніж на 50 000 ₴ або вдвічі (що більше).
-- Решту сервер не приймає і записує в журнал, який розробник бачить командою suspects.
alter table public.profiles add column if not exists gain_since timestamptz;
alter table public.profiles add column if not exists gain_sum bigint not null default 0;
alter table public.profiles add column if not exists gain_base bigint not null default 0;

create table if not exists public.cheat_log (
  id bigint generated always as identity primary key,
  profile uuid not null references public.profiles(id) on delete cascade,
  tried bigint not null,
  allowed bigint not null,
  balance_before bigint not null,
  created_at timestamptz not null default now()
);
alter table public.cheat_log enable row level security;

create or replace function public.save_state(p_state jsonb, p_rev bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  old_bal bigint; new_bal bigint; delta bigint; cap bigint; allowed bigint;
  w_since timestamptz; w_sum bigint; w_base bigint;
  clamped boolean := false;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if p is null then raise exception 'no_profile'; end if;
  if p.banned_until > now() then raise exception 'banned'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 200000 then raise exception 'bad_state'; end if;
  if p.state_rev <> p_rev then
    return jsonb_build_object('ok', false, 'rev', p.state_rev, 'state', p.state);
  end if;

  old_bal := coalesce(round((p.state->>'balance')::numeric)::bigint, p.balance, 0);
  new_bal := greatest(0, coalesce(round((p_state->>'balance')::numeric)::bigint, old_bal));
  if p.gain_since is null or p.gain_since < now() - interval '1 hour' then
    w_since := now(); w_sum := 0; w_base := old_bal;
  else
    w_since := p.gain_since; w_sum := p.gain_sum; w_base := p.gain_base;
  end if;
  delta := new_bal - old_bal;
  if delta > 0 then
    cap := greatest(5000000, w_base);
    allowed := greatest(0, cap - w_sum);
    if delta > allowed then
      insert into public.cheat_log (profile, tried, allowed, balance_before) values (p.id, delta, allowed, old_bal);
      new_bal := old_bal + allowed;
      delta := allowed;
      p_state := jsonb_set(p_state, '{balance}', to_jsonb(new_bal));
      clamped := true;
    end if;
  end if;
  w_sum := w_sum + delta;

  perform set_config('app.trusted', 'on', true);
  update public.profiles set
    state = p_state,
    state_rev = p.state_rev + 1,
    balance = new_bal,
    level = least(coalesce((p_state->>'level')::int, level), 500),
    owned = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_state->'owned', '[]'::jsonb)) x), '{}'),
    gain_since = w_since,
    gain_sum = w_sum,
    gain_base = w_base,
    updated_at = now()
  where id = p.id;
  perform set_config('app.trusted', '', true);
  if clamped then
    return jsonb_build_object('ok', false, 'clamped', true, 'rev', p.state_rev + 1, 'state', p_state);
  end if;
  return jsonb_build_object('ok', true, 'rev', p.state_rev + 1);
end $$;

-- 3. Подарунок другу: стільки грошей має реально бути на сервері.
create or replace function public.send_coins(p_to uuid, p_amount bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare tid bigint; sent_today bigint; unlimited boolean;
begin
  if public.is_banned(auth.uid()) then raise exception 'banned'; end if;
  if not public.are_friends(auth.uid(), p_to) then raise exception 'not_friends'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad_amount'; end if;
  select coalesce(code = '777777', false) into unlimited from public.profiles where id = auth.uid();
  if not coalesce(unlimited, false) then
    if public.server_balance(auth.uid()) < p_amount then raise exception 'no_money'; end if;
    select coalesce(sum(t.amount), 0) into sent_today from public.transfers t
      where t.sender = auth.uid() and t.created_at > now() - interval '1 day';
    if sent_today + p_amount > 1000000 then raise exception 'daily_limit'; end if;
  end if;
  insert into public.transfers (sender, receiver, amount) values (auth.uid(), p_to, p_amount) returning id into tid;
  return tid;
end $$;

-- Дуель: ставку треба мати на сервері (і тому, хто кличе, і тому, хто приймає).
create or replace function public.duel_money_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if public.server_balance(new.challenger) < new.stake then raise exception 'no_money'; end if;
  elsif new.status = 'accepted' and old.status = 'pending' then
    if public.server_balance(new.opponent) < new.stake then raise exception 'no_money'; end if;
  end if;
  return new;
end $$;
drop trigger if exists duel_money_check on public.duels;
create trigger duel_money_check before insert or update of status on public.duels
  for each row execute function public.duel_money_check();

-- 4. Промокоди тепер лише на сервері: у коді гри їх більше не видно.
create table if not exists public.promo_codes (
  code text primary key,
  amount bigint not null default 0,
  reset boolean not null default false,
  cooldown interval            -- null: лише один раз на гравця
);
alter table public.promo_codes enable row level security;
create table if not exists public.promo_uses (
  profile uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  used_at timestamptz not null default now()
);
alter table public.promo_uses enable row level security;
create index if not exists promo_uses_by on public.promo_uses (profile, code, used_at desc);

insert into public.promo_codes (code, amount, reset, cooldown) values
  ('salo', 1000000, false, interval '1 hour'),
  ('ben', 0, true, interval '1 second')
on conflict (code) do nothing;

create or replace function public.redeem_promo(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.promo_codes; last_use timestamptz; bal bigint;
begin
  if public.is_banned(auth.uid()) then raise exception 'banned'; end if;
  select * into c from public.promo_codes where code = lower(trim(p_code));
  if c is null then return jsonb_build_object('result', 'invalid'); end if;
  select max(used_at) into last_use from public.promo_uses where profile = auth.uid() and code = c.code;
  if last_use is not null and (c.cooldown is null or last_use > now() - c.cooldown) then
    return jsonb_build_object('result', 'used', 'next', case when c.cooldown is null then null else last_use + c.cooldown end);
  end if;
  insert into public.promo_uses (profile, code) values (auth.uid(), c.code);
  if c.reset then
    bal := public.server_balance(auth.uid());
    perform public.state_credit(auth.uid(), -bal);
    return jsonb_build_object('result', 'reset');
  end if;
  perform public.state_credit(auth.uid(), c.amount);
  return jsonb_build_object('result', 'ok', 'amount', c.amount);
end $$;

-- 5. Розробнику: хто намагався накрутити (команда suspects у терміналі).
create or replace function public.admin_suspects() returns table (
  code text, name text, tried bigint, allowed bigint, balance_before bigint, created_at timestamptz
)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return query
    select p.code, p.name, l.tried, l.allowed, l.balance_before, l.created_at
    from public.cheat_log l join public.profiles p on p.id = l.profile
    order by l.created_at desc limit 30;
end $$;

revoke execute on function public.server_balance(uuid) from anon, authenticated;
revoke execute on function public.redeem_promo(text) from anon;
revoke execute on function public.admin_suspects() from anon;
revoke execute on function public.save_state(jsonb, bigint) from anon;
revoke execute on function public.send_coins(uuid, bigint) from anon;
