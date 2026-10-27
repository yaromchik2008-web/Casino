-- Casino Victor: друзі, повідомлення і передача ігрових гривень.
-- Запусти один раз у Supabase: SQL Editor → New query → встав увесь файл → Run.
-- Також увімкни Authentication → Sign In / Providers → Anonymous sign-ins.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  code text unique not null,
  name text not null default 'Гравець' check (char_length(name) between 1 and 24),
  balance bigint not null default 0,
  level int not null default 1,
  status text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create table if not exists public.friendships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table public.friendships enable row level security;
drop policy if exists "friendships read own" on public.friendships;
create policy "friendships read own" on public.friendships for select to authenticated using (user_id = auth.uid());

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friendships where user_id = a and friend_id = b);
$$;

create or replace function public.add_friend(friend_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select id into fid from public.profiles where code = upper(trim(friend_code));
  if fid is null then raise exception 'not_found'; end if;
  if fid = auth.uid() then raise exception 'self'; end if;
  insert into public.friendships (user_id, friend_id)
    values (auth.uid(), fid), (fid, auth.uid())
    on conflict do nothing;
  return fid;
end $$;

create or replace function public.remove_friend(fid uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.friendships
  where (user_id = auth.uid() and friend_id = fid) or (user_id = fid and friend_id = auth.uid());
$$;

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  receiver uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists messages_pair on public.messages (sender, receiver, created_at desc);
alter table public.messages enable row level security;
drop policy if exists "messages read own" on public.messages;
create policy "messages read own" on public.messages for select to authenticated
  using (sender = auth.uid() or receiver = auth.uid());
drop policy if exists "messages send to friends" on public.messages;
create policy "messages send to friends" on public.messages for insert to authenticated
  with check (sender = auth.uid() and public.are_friends(auth.uid(), receiver));

create table if not exists public.transfers (
  id bigint generated always as identity primary key,
  sender uuid not null references public.profiles(id) on delete cascade,
  receiver uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null check (amount > 0),
  claimed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.transfers enable row level security;
drop policy if exists "transfers read own" on public.transfers;
create policy "transfers read own" on public.transfers for select to authenticated
  using (sender = auth.uid() or receiver = auth.uid());

-- Суми в копійках. Ліміт: 10 000 ігрових ₴ на добу від одного гравця.
create or replace function public.send_coins(p_to uuid, p_amount bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare tid bigint; sent_today bigint;
begin
  if not public.are_friends(auth.uid(), p_to) then raise exception 'not_friends'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad_amount'; end if;
  select coalesce(sum(t.amount), 0) into sent_today from public.transfers t
    where t.sender = auth.uid() and t.created_at > now() - interval '1 day';
  if sent_today + p_amount > 1000000 then raise exception 'daily_limit'; end if;
  insert into public.transfers (sender, receiver, amount) values (auth.uid(), p_to, p_amount) returning id into tid;
  return tid;
end $$;

create or replace function public.claim_transfers() returns bigint
language plpgsql security definer set search_path = public as $$
declare total bigint;
begin
  with c as (
    update public.transfers set claimed = true
    where receiver = auth.uid() and not claimed
    returning amount
  )
  select coalesce(sum(amount), 0) into total from c;
  return total;
end $$;

revoke execute on function public.are_friends(uuid, uuid) from anon;
revoke execute on function public.add_friend(text) from anon;
revoke execute on function public.remove_friend(uuid) from anon;
revoke execute on function public.send_coins(uuid, bigint) from anon;
revoke execute on function public.claim_transfers() from anon;
