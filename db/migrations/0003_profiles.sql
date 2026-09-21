-- profiles: 1:1 mirror of neon_auth."user" (Neon Auth / Managed Better
-- Auth's own user table), holding the app-facing user data. Not
-- tenant-scoped by itself — a user can belong to more than one tenant
-- through `memberships` (created in the next migration).
create table public.profiles (
  id uuid primary key references neon_auth."user" (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Table-level grants only decide *whether* a role may attempt the
-- operation at all; RLS policies below still decide *which rows*. Both
-- are required — a GRANT without RLS would expose every row, and RLS
-- without a GRANT fails closed with a permission error instead of an
-- empty result set. `authenticated` here is the role the Neon Data API
-- uses for any request carrying a valid Neon Auth JWT.
grant select, update on public.profiles to authenticated;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- A user may only ever read/update their own profile row. Letting other
-- tenant members see each other's profile is a Task 03 (permissions)
-- concern, not a Task 02 one.
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No insert/delete policy for authenticated users: profile rows are only
-- ever created by the handle_new_user trigger below and removed via the
-- neon_auth."user" cascade, never directly by client code.

-- Keeps `profiles` in sync with `neon_auth."user"` the moment an account
-- is created, so the rest of the schema can always assume a matching row
-- exists in `public.profiles` for any `auth.uid()`.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.name);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on neon_auth."user"
  for each row
  execute function public.handle_new_user();
