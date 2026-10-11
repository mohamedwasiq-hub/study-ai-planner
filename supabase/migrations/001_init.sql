-- Study AI Planner: tables, row-level security, storage and signup trigger.
-- Every row belongs to one user; RLS keeps each student's data private.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  class int check (class between 9 and 12),
  stream text check (stream in ('Science', 'Commerce', 'Humanities')),
  medium text not null default 'English' check (medium in ('English', 'Hindi')),
  exam_date date,
  created_at timestamptz not null default now()
);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  class int not null check (class between 9 and 12),
  subject text not null,
  title text not null,
  status text not null default 'new' check (status in ('new', 'reading', 'done', 'error')),
  created_at timestamptz not null default now()
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid not null references public.books on delete cascade,
  number int not null,
  title text not null,
  page_from int not null,
  page_to int not null check (page_to >= page_from),
  status text not null default 'pending' check (status in ('pending', 'reading', 'done', 'error')),
  unique (book_id, number)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid not null references public.books on delete cascade,
  chapter_ids uuid[] not null default '{}',
  style text not null,
  prompt text,
  provider text not null,
  content_md text not null,
  created_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid references public.books on delete cascade,
  exam_date date not null,
  created_at timestamptz not null default now()
);

create table public.plan_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_id uuid not null references public.plans on delete cascade,
  date date not null,
  items jsonb not null default '[]',
  done boolean not null default false
);

-- Written only by Edge Functions (service role); students can read their own count.
create table public.usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);

-- Own API keys. No client policies at all: only Edge Functions (service role) touch this.
create table public.user_keys (
  user_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('gemini', 'claude')),
  encrypted_key text not null,
  primary key (user_id, provider)
);

create index on public.books (user_id);
create index on public.chapters (book_id);
create index on public.chapters (user_id);
create index on public.notes (book_id);
create index on public.notes (user_id);
create index on public.plans (user_id);
create index on public.plans (book_id);
create index on public.plan_days (plan_id);
create index on public.plan_days (user_id);

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.chapters enable row level security;
alter table public.notes enable row level security;
alter table public.plans enable row level security;
alter table public.plan_days enable row level security;
alter table public.usage enable row level security;
alter table public.user_keys enable row level security;

create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own books" on public.books for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own chapters" on public.chapters for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own notes" on public.notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own plans" on public.plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own plan days" on public.plan_days for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "read own usage" on public.usage for select to authenticated
  using (user_id = (select auth.uid()));

-- A profile row appears the moment someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name) values (new.id, new.raw_user_meta_data ->> 'name');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Private textbook uploads, stored under <user id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('textbooks', 'textbooks', false, 52428800, array['application/pdf']);

create policy "own textbooks read" on storage.objects for select to authenticated
  using (bucket_id = 'textbooks' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own textbooks upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'textbooks' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own textbooks delete" on storage.objects for delete to authenticated
  using (bucket_id = 'textbooks' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The trigger function must not be callable through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
