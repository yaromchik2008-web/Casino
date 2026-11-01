-- Casino Victor v17: замок на ім'я, видача номерів з термінала, непрочитані повідомлення в «Друзях».
-- Запусти один раз у Supabase (SQL Editor → New query → встав увесь файл → Run) після docs/supabase-v16.sql.

-- 1. Замок на ім'я: гравець не може його змінити, розробник може.
alter table public.profiles add column if not exists name_locked boolean not null default false;

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
    new.name_locked := old.name_locked;
    if old.name_locked then new.name := old.name; end if;
    if new.level > old.level + 1 then new.level := old.level; end if;
    -- Номер у профілі показуємо лише свій і лише за 96 000 ₴.
    if new.plate is distinct from old.plate and new.plate is not null
      and not exists (select 1 from public.plates p where p.plate = new.plate and p.owner = new.id and p.value >= 9600000) then
      new.plate := old.plate;
    end if;
  end if;
  return new;
end $$;

drop function if exists public.admin_players(text);
create or replace function public.admin_players(p_query text default '') returns table (
  id uuid, code text, name text, balance bigint, level int, status text, owned text[], updated_at timestamptz,
  online boolean, banned_until timestamptz, ban_note text, plate text, name_locked boolean
)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return query
    select p.id, p.code, p.name, p.balance, p.level, p.status, p.owned, p.updated_at,
      p.updated_at > now() - interval '2 minutes', p.banned_until, p.ban_note, p.plate, p.name_locked
    from public.profiles p
    where coalesce(p_query, '') = '' or p.code = upper(trim(p_query)) or p.name ilike '%' || trim(p_query) || '%'
    order by p.updated_at desc limit 50;
end $$;

-- 2. Нові команди розробника: name_lock [нове ім'я], name_unlock, plate_give НОМЕР (ціна в p_value).
create or replace function public.admin_extra(p_code text, p_kind text, p_note text default null, p_value bigint default null)
returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; nm text; st jsonb; pl text; owner_id uuid;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select id, name, state into uid, nm, st from public.profiles where code = upper(trim(p_code));
  if uid is null then raise exception 'not_found'; end if;
  perform set_config('app.trusted', 'on', true);
  if p_kind = 'name_lock' then
    if coalesce(trim(p_note), '') <> '' then nm := left(trim(p_note), 24); end if;
    update public.profiles set name = nm, name_locked = true where id = uid;
  elsif p_kind = 'name_unlock' then
    update public.profiles set name_locked = false where id = uid;
  elsif p_kind = 'plate_give' then
    pl := upper(regexp_replace(trim(coalesce(p_note, '')), '\s+', ' ', 'g'));
    if char_length(pl) < 2 or char_length(pl) > 12 then raise exception 'bad_plate'; end if;
    if p_value is null or p_value <= 0 then raise exception 'bad_amount'; end if;
    select owner into owner_id from public.plates where plate = pl;
    if owner_id is not null and owner_id <> uid then raise exception 'taken'; end if;
    insert into public.plates (plate, owner, value) values (pl, uid, p_value)
      on conflict (plate) do update set value = excluded.value;
    if st is not null then
      st := jsonb_set(st, '{plates}',
        coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(st->'plates', '[]'::jsonb)) x where x->>'id' <> pl), '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('id', pl, 'value', p_value)));
      update public.profiles set state = st, state_rev = state_rev + 1 where id = uid;
    end if;
    insert into public.admin_actions (user_id, kind, note, applied) values (uid, 'message', 'Розробник подарував тобі номер ' || pl, true);
  else
    raise exception 'bad_kind';
  end if;
  perform set_config('app.trusted', '', true);
  return nm;
end $$;

-- 3. Прочитані повідомлення і підсумок чатів для вкладки «Друзі».
alter table public.messages add column if not exists read_at timestamptz;
create index if not exists messages_unread on public.messages (receiver, sender) where read_at is null;

create or replace function public.mark_read(p_friend uuid) returns void
language sql security definer set search_path = public as $$
  update public.messages set read_at = now() where receiver = auth.uid() and sender = p_friend and read_at is null;
$$;

create or replace function public.chat_summary() returns table (
  friend_id uuid, last_body text, last_at timestamptz, last_from_me boolean, unread int
)
language sql security definer set search_path = public stable as $$
  with mine as (
    select case when m.sender = auth.uid() then m.receiver else m.sender end as f, m.*
    from public.messages m
    where m.sender = auth.uid() or m.receiver = auth.uid()
  ), last as (
    select distinct on (f) f, body, created_at, sender = auth.uid() as from_me from mine order by f, created_at desc, id desc
  )
  select l.f, l.body, l.created_at, l.from_me,
    (select count(*)::int from mine u where u.f = l.f and u.receiver = auth.uid() and u.read_at is null)
  from last l;
$$;

revoke execute on function public.admin_players(text) from anon;
revoke execute on function public.admin_extra(text, text, text, bigint) from anon;
revoke execute on function public.mark_read(uuid) from anon;
revoke execute on function public.chat_summary() from anon;
