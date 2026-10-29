-- Casino Victor v12: термінал розробника для гравця 777777 і сильніша рефералка.
-- Запусти один раз у Supabase (SQL Editor → New query → встав увесь файл → Run).

-- 1. Адміни. Права перевіряються тут, на сервері: клієнт лише показує термінал.
create table if not exists public.admins (
  user_id uuid primary key references public.profiles(id) on delete cascade
);
alter table public.admins enable row level security; -- без політик: з гри таблицю не видно
insert into public.admins (user_id) select id from public.profiles where code = '777777' on conflict do nothing;

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Код гравця більше не можна змінити звичайним оновленням профілю (щоб ніхто не «став» 777777).
create or replace function public.lock_profile_code() returns trigger
language plpgsql as $$
begin
  if new.code is distinct from old.code then new.code := old.code; end if;
  return new;
end $$;
drop trigger if exists lock_profile_code on public.profiles;
create trigger lock_profile_code before update on public.profiles for each row execute function public.lock_profile_code();

-- 2. Черга команд адміна. Гра гравця забирає їх і застосовує (баланс, майно, рівень, повідомлення).
create table if not exists public.admin_actions (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('balance_set', 'balance_add', 'balance_take', 'item_give', 'item_take', 'level_set', 'message', 'reset')),
  value bigint,
  item text,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
alter table public.admin_actions enable row level security;

create or replace function public.admin_players(p_query text default '') returns table (
  id uuid, code text, name text, balance bigint, level int, status text, owned text[], updated_at timestamptz
)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return query
    select p.id, p.code, p.name, p.balance, p.level, p.status, p.owned, p.updated_at from public.profiles p
    where coalesce(p_query, '') = '' or p.code = upper(trim(p_query)) or p.name ilike '%' || trim(p_query) || '%'
    order by p.updated_at desc limit 50;
end $$;

create or replace function public.admin_act(p_code text, p_kind text, p_value bigint default null, p_item text default null, p_note text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; nm text;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select id, name into uid, nm from public.profiles where code = upper(trim(p_code));
  if uid is null then raise exception 'not_found'; end if;
  if p_kind in ('balance_set', 'balance_add', 'balance_take', 'level_set') and (p_value is null or p_value < 0) then raise exception 'bad_amount'; end if;
  insert into public.admin_actions (user_id, kind, value, item, note) values (uid, p_kind, p_value, p_item, p_note);
  return nm;
end $$;

create or replace function public.take_admin_actions() returns setof public.admin_actions
language sql security definer set search_path = public as $$
  delete from public.admin_actions where user_id = auth.uid() returning *;
$$;

revoke execute on function public.is_admin() from anon;
revoke execute on function public.admin_players(text) from anon;
revoke execute on function public.admin_act(text, text, bigint, text, text) from anon;
revoke execute on function public.take_admin_actions() from anon;

-- 3. Рефералка: +200 ₴ обом, а запрошувач ще отримує призи за 3, 5, 10, 25 і 50 друзів.
create or replace function public.claim_referral(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare inviter uuid; me public.profiles; joined timestamptz; invited int; prize bigint;
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if me is null then raise exception 'no_profile'; end if; -- профіль ще не створився: гра спробує ще раз
  if me.referred_by is not null then raise exception 'already_referred'; end if;
  select id into inviter from public.profiles where code = upper(trim(p_code));
  if inviter is null then raise exception 'not_found'; end if;
  if inviter = me.id then raise exception 'self'; end if;
  select created_at into joined from auth.users where id = me.id;
  if joined < now() - interval '7 days' then raise exception 'referral_too_late'; end if;
  select count(*) into invited from public.profiles where referred_by = inviter;
  if invited >= 1000 then raise exception 'referral_limit'; end if;

  perform set_config('app.referral', 'on', true);
  update public.profiles set referred_by = inviter where id = me.id;
  perform set_config('app.referral', '', true);
  insert into public.transfers (sender, receiver, amount) values (null, me.id, 20000), (null, inviter, 20000);
  prize := case invited + 1 when 3 then 30000 when 5 then 50000 when 10 then 100000 when 25 then 300000 when 50 then 500000 else 0 end;
  if prize > 0 then insert into public.transfers (sender, receiver, amount) values (null, inviter, prize); end if;
  insert into public.friendships (user_id, friend_id) values (me.id, inviter), (inviter, me.id) on conflict do nothing;
  return (select name from public.profiles where id = inviter);
end $$;
revoke execute on function public.claim_referral(text) from anon;

-- Топ запрошувачів для таблиці в грі.
create or replace function public.top_referrers() returns table (name text, invited int)
language sql security definer set search_path = public stable as $$
  select p.name, count(*)::int from public.profiles r join public.profiles p on p.id = r.referred_by
  group by p.id, p.name order by 2 desc limit 10;
$$;
revoke execute on function public.top_referrers() from anon;
