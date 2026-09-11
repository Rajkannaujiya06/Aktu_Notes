-- Run this whole file once in Supabase Dashboard -> SQL Editor.
-- It creates the notes catalogue, the public PDF bucket, and secure admin-only writes.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null unique
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  year_id uuid not null references public.years(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (year_id, name)
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null,
  sort_order integer not null default 1,
  unique (subject_id, name)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  file_size bigint not null default 0 check (file_size >= 0),
  created_at timestamptz not null default now()
);

insert into public.years (name, sort_order) values
  ('Semester 1', 1), ('Semester 2', 2), ('Semester 3', 3), ('Semester 4', 4)
on conflict (name) do update set sort_order = excluded.sort_order;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notes', 'notes', true, 52428800, array['application/pdf'])
on conflict (id) do update set public = true, file_size_limit = 52428800,
  allowed_mime_types = array['application/pdf'];

alter table public.profiles enable row level security;
alter table public.years enable row level security;
alter table public.subjects enable row level security;
alter table public.units enable row level security;
alter table public.notes enable row level security;

-- Data API permissions: RLS policies below still decide which individual rows
-- each visitor can access.
grant select on public.years, public.subjects, public.units, public.notes to anon, authenticated;
grant insert, update, delete on public.years, public.subjects, public.units, public.notes to authenticated;
grant select, update on public.profiles to authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "public reads profiles" on public.profiles;
create policy "users read own profile" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads years" on public.years;
create policy "public reads years" on public.years for select using (true);
drop policy if exists "admins manage years" on public.years;
create policy "admins manage years" on public.years for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "public reads subjects" on public.subjects;
create policy "public reads subjects" on public.subjects for select using (true);
drop policy if exists "admins manage subjects" on public.subjects;
create policy "admins manage subjects" on public.subjects for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "public reads units" on public.units;
create policy "public reads units" on public.units for select using (true);
drop policy if exists "admins manage units" on public.units;
create policy "admins manage units" on public.units for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "public reads notes" on public.notes;
create policy "public reads notes" on public.notes for select using (true);
drop policy if exists "admins manage notes" on public.notes;
create policy "admins manage notes" on public.notes for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads PDFs" on storage.objects;
create policy "public reads PDFs" on storage.objects for select using (bucket_id = 'notes');
drop policy if exists "admins upload PDFs" on storage.objects;
create policy "admins upload PDFs" on storage.objects for insert to authenticated with check (bucket_id = 'notes' and public.is_admin());
drop policy if exists "admins update PDFs" on storage.objects;
create policy "admins update PDFs" on storage.objects for update to authenticated using (bucket_id = 'notes' and public.is_admin()) with check (bucket_id = 'notes' and public.is_admin());
drop policy if exists "admins delete PDFs" on storage.objects;
create policy "admins delete PDFs" on storage.objects for delete to authenticated using (bucket_id = 'notes' and public.is_admin());

-- After you create your account (Authentication -> Users, or the sign-up button
-- in the site), replace the email and run this once to make it an administrator:
-- update public.profiles set is_admin = true
-- where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL');
