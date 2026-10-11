-- Free storage is 1 GB for everyone, so each student keeps at most 3 books. Enforced here so the app can't bypass it.
create function public.limit_books() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.books where user_id = new.user_id) >= 3 then
    raise exception 'You can keep up to 3 books. Delete one to add another.';
  end if;
  return new;
end;
$$;
revoke execute on function public.limit_books() from public, anon, authenticated;
create trigger books_limit before insert on public.books for each row execute function public.limit_books();
