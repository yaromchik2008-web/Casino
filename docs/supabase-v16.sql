-- Casino Victor v16: прибрано ліміт виграшу 50 000 ₴ за годину (на прохання ghj).
-- Запусти один раз у Supabase (SQL Editor → New query → встав увесь файл → Run) після docs/supabase-v15.sql.
-- Решта захисту з v15 лишається: баланс не переписати запитом, подарунки й дуелі лише з грошей на сервері,
-- промокоди на сервері, «Скинути прогрес» лише раз.

create or replace function public.save_state(p_state jsonb, p_rev bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if p is null then raise exception 'no_profile'; end if;
  if p.banned_until > now() then raise exception 'banned'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 200000 then raise exception 'bad_state'; end if;
  if p.state_rev <> p_rev then
    return jsonb_build_object('ok', false, 'rev', p.state_rev, 'state', p.state);
  end if;
  -- «Скинути прогрес» можна лише раз: позначку про скидання гра стерти не може.
  if p.state ? 'lastResetAt' then p_state := jsonb_set(p_state, '{lastResetAt}', p.state->'lastResetAt'); end if;
  perform set_config('app.trusted', 'on', true);
  update public.profiles set
    state = p_state,
    state_rev = p.state_rev + 1,
    balance = greatest(0, coalesce(round((p_state->>'balance')::numeric)::bigint, balance)),
    level = least(coalesce((p_state->>'level')::int, level), 500),
    owned = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_state->'owned', '[]'::jsonb)) x), '{}'),
    updated_at = now()
  where id = p.id;
  perform set_config('app.trusted', '', true);
  return jsonb_build_object('ok', true, 'rev', p.state_rev + 1);
end $$;

revoke execute on function public.save_state(jsonb, bigint) from anon;
