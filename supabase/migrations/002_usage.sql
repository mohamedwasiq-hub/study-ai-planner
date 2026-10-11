-- Counts one AI request for today. Only Edge Functions (service role) may call it.
create function public.bump_usage(uid uuid) returns int
language sql security definer set search_path = '' as $$
  insert into public.usage (user_id, day, count) values (uid, current_date, 1)
  on conflict (user_id, day) do update set count = public.usage.count + 1
  returning count;
$$;
revoke execute on function public.bump_usage(uuid) from public, anon, authenticated;
grant execute on function public.bump_usage(uuid) to service_role;
