-- Casino Victor v4: майно гравця в профілі, щоб інші бачили, що в нього є.
-- Запусти один раз у Supabase (SQL Editor → New query → Run).
alter table public.profiles add column if not exists owned text[] not null default '{}';
alter table public.profiles drop constraint if exists profiles_owned_len;
alter table public.profiles add constraint profiles_owned_len check (coalesce(array_length(owned, 1), 0) <= 200);
