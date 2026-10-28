-- Casino Victor v7: адмін-команда «встановити баланс гравцю».
-- Запусти один раз у Supabase (SQL Editor → New query → Run).
-- Потім, щоб змінити баланс, у SQL Editor виконай, наприклад:
--   select admin_set_balance('2NKFQA', 5000);   -- код гравця і сума в гривнях
-- Гра гравця підхопить нову суму протягом 30 секунд (або щойно він відкриє гру).

create table if not exists public.balance_overrides (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null check (balance >= 0),
  created_at timestamptz not null default now()
);
alter table public.balance_overrides enable row level security;

-- Лише для адміна в SQL Editor: гравці викликати її не можуть.
create or replace function public.admin_set_balance(p_code text, p_uah numeric) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; nm text;
begin
  select id, name into uid, nm from public.profiles where code = upper(trim(p_code));
  if uid is null then raise exception 'Гравця з кодом % немає', p_code; end if;
  insert into public.balance_overrides (user_id, balance) values (uid, round(p_uah * 100))
    on conflict (user_id) do update set balance = excluded.balance, created_at = now();
  return nm || ': баланс буде ' || p_uah || ' ₴';
end $$;
revoke execute on function public.admin_set_balance(text, numeric) from public, anon, authenticated;

-- Гра забирає нову суму для себе й видаляє запис.
create or replace function public.take_balance_override() returns bigint
language plpgsql security definer set search_path = public as $$
declare b bigint;
begin
  delete from public.balance_overrides where user_id = auth.uid() returning balance into b;
  return b;
end $$;
revoke execute on function public.take_balance_override() from anon;
