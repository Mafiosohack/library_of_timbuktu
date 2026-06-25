-- =============================================================================
-- Library of Timbuktu — initial schema, RLS, and Storage policies
-- Run in the Supabase SQL Editor, or via the Supabase CLI (`supabase db push`).
--
-- Security model: a private, invite-only app with two roles.
--   * admin  — adds/removes books, writes summaries
--   * member — browses, reads summaries, downloads shareable books
-- Every authenticated user is a trusted member; there is NO anonymous access.
-- Public signup is disabled in the dashboard (Authentication → Providers →
-- Email → "Allow new users to sign up" = OFF). Members are added via the
-- invite/admin flow; promote someone to admin by setting profiles.role.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Profiles + roles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id   uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member'))
);

-- Create a profile row automatically for every new auth user (default member).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'member')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: is the current user an admin? SECURITY DEFINER so policies can call
-- it without needing direct select rights on profiles.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.books (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  author          text,
  storage_path    text not null,            -- path inside the 'books' bucket
  cover_path      text,                     -- path inside the 'covers' bucket
  file_size_bytes bigint,
  format          text not null check (format in ('pdf', 'epub', 'mobi')),
  shareable       boolean not null default false,  -- gates download; see route
  uploaded_by     uuid not null references auth.users(id),
  created_at      timestamptz not null default now()
);

create table if not exists public.chapters (
  id             uuid primary key default gen_random_uuid(),
  book_id        uuid not null references public.books(id) on delete cascade,
  chapter_number int not null,
  title          text,
  unique (book_id, chapter_number)
);

create table if not exists public.summaries (
  id             uuid primary key default gen_random_uuid(),
  chapter_id     uuid not null references public.chapters(id) on delete cascade,
  ai_draft       text,
  edited_content text,
  edited_by      uuid references auth.users(id),
  updated_at     timestamptz not null default now()
);

create unique index if not exists summaries_chapter_id_key
  on public.summaries (chapter_id);
create index if not exists chapters_book_id_idx on public.chapters (book_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles  enable row level security;
alter table public.books     enable row level security;
alter table public.chapters  enable row level security;
alter table public.summaries enable row level security;

-- profiles: a user can read their own profile (the app needs to know its role).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());

-- books: everyone authenticated can read; only admins can write.
drop policy if exists "books_select" on public.books;
create policy "books_select" on public.books
  for select to authenticated using (true);

drop policy if exists "books_insert_admin" on public.books;
create policy "books_insert_admin" on public.books
  for insert to authenticated
  with check (public.is_admin() and uploaded_by = auth.uid());

drop policy if exists "books_update_admin" on public.books;
create policy "books_update_admin" on public.books
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "books_delete_admin" on public.books;
create policy "books_delete_admin" on public.books
  for delete to authenticated using (public.is_admin());

-- chapters: everyone reads; admins write.
drop policy if exists "chapters_select" on public.chapters;
create policy "chapters_select" on public.chapters
  for select to authenticated using (true);

drop policy if exists "chapters_write_admin" on public.chapters;
create policy "chapters_write_admin" on public.chapters
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- summaries: everyone reads; admins write.
drop policy if exists "summaries_select" on public.summaries;
create policy "summaries_select" on public.summaries
  for select to authenticated using (true);

drop policy if exists "summaries_write_admin" on public.summaries;
create policy "summaries_write_admin" on public.summaries
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Keep summaries.updated_at fresh on edit.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists summaries_touch_updated_at on public.summaries;
create trigger summaries_touch_updated_at
  before update on public.summaries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Storage: two private buckets
-- ---------------------------------------------------------------------------
-- Both private (public = false) — no anonymous URLs; access is via
-- server-issued signed URLs only. file_size_limit enforces the per-file caps
-- at the storage layer (the /api/upload-url route validates format + size too).

insert into storage.buckets (id, name, public, file_size_limit)
values ('books', 'books', false, 52428800)      -- 50 MB
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit)
values ('covers', 'covers', false, 5242880)      -- 5 MB
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit;

-- Reads: any authenticated member (covers display, plus belt-and-suspenders;
-- signed URLs are generated server-side with the service role regardless).
-- Writes/deletes: admins only.
drop policy if exists "storage_select_auth" on storage.objects;
create policy "storage_select_auth" on storage.objects
  for select to authenticated
  using (bucket_id in ('books', 'covers'));

drop policy if exists "storage_insert_admin" on storage.objects;
create policy "storage_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('books', 'covers') and public.is_admin());

drop policy if exists "storage_update_admin" on storage.objects;
create policy "storage_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id in ('books', 'covers') and public.is_admin());

drop policy if exists "storage_delete_admin" on storage.objects;
create policy "storage_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id in ('books', 'covers') and public.is_admin());
