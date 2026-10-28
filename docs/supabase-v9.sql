-- Casino Victor v9: покупки ігрових ₴ за Telegram Stars.
-- Запусти один раз у Supabase (SQL Editor → New query → Run).
-- Кожна оплата записується один раз (за id платежу Telegram), тож гроші не зарахуються двічі.

create table if not exists public.purchases (
  charge_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  pack text not null,
  stars int not null,
  amount bigint not null,
  created_at timestamptz not null default now()
);
alter table public.purchases enable row level security;
drop policy if exists "purchases read own" on public.purchases;
create policy "purchases read own" on public.purchases for select to authenticated using (user_id = auth.uid());
