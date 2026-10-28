-- Casino Victor v5: запрошення друзів. Запусти один раз у Supabase (SQL Editor → New query → Run).
-- Хто запросив і кого запросили, отримують по 200 ₴ (20 000 копійок) переказом від гри.

alter table public.profiles add column if not exists referred_by uuid references public.profiles(id) on delete set null;

-- Поле referred_by змінює лише claim_referral, а не сам гравець через звичайне оновлення профілю.
create or replace function public.lock_referred_by() returns trigger
language plpgsql as $$
begin
  if new.referred_by is distinct from old.referred_by and coalesce(current_setting('app.referral', true), '') <> 'on' then
    new.referred_by := old.referred_by;
  end if;
  return new;
end $$;
drop trigger if exists lock_referred_by on public.profiles;
create trigger lock_referred_by before update on public.profiles for each row execute function public.lock_referred_by();

-- Новий гравець вводить код друга (або відкриває гру за посиланням).
-- Працює лише раз і лише протягом 7 днів після першого входу, щоб не накручували старі акаунти.
create or replace function public.claim_referral(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare inviter uuid; me public.profiles; joined timestamptz; invited int;
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if me is null then raise exception 'not_found'; end if;
  if me.referred_by is not null then raise exception 'already_referred'; end if;
  select id into inviter from public.profiles where code = upper(trim(p_code));
  if inviter is null then raise exception 'not_found'; end if;
  if inviter = me.id then raise exception 'self'; end if;
  select created_at into joined from auth.users where id = me.id;
  if joined < now() - interval '7 days' then raise exception 'referral_too_late'; end if;
  select count(*) into invited from public.profiles where referred_by = inviter;
  if invited >= 100 then raise exception 'referral_limit'; end if;

  perform set_config('app.referral', 'on', true);
  update public.profiles set referred_by = inviter where id = me.id;
  perform set_config('app.referral', '', true);
  insert into public.transfers (sender, receiver, amount) values (null, me.id, 20000), (null, inviter, 20000);
  -- Одразу стаєте друзями.
  insert into public.friendships (user_id, friend_id) values (me.id, inviter), (inviter, me.id) on conflict do nothing;
  return (select name from public.profiles where id = inviter);
end $$;

create or replace function public.my_referrals() returns int
language sql security definer set search_path = public stable as $$
  select count(*)::int from public.profiles where referred_by = auth.uid();
$$;

revoke execute on function public.claim_referral(text) from anon;
revoke execute on function public.my_referrals() from anon;
