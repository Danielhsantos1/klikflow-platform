-- Core multi-tenancy: Empresa (tenant) -> Unidade (unit) -> membership.
-- tenants, units and memberships are created together in one migration
-- because their RLS policies are mutually dependent (a unit's visibility
-- depends on tenant membership, and membership visibility depends on
-- itself) — splitting them would leave an intermediate migration with a
-- table temporarily unprotected.

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Descriptive only. The product must stay configurable per segment, so
  -- nothing in the schema or app code may branch behavior on this value.
  segment text not null default 'other'
    check (segment in (
      'cafeteria', 'restaurant', 'bar', 'hotel', 'clinic',
      'convenience', 'other'
    )),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index units_tenant_id_idx on public.units (tenant_id);

-- `role` is intentionally a small, fixed set for this foundational task.
-- Task 03 introduces the configurable profile/permission system; this
-- column is the minimal thing RLS needs until then and is expected to
-- either be replaced by, or backed onto, that system later.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  role text not null default 'staff'
    check (role in ('owner', 'manager', 'staff')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_tenant_id_idx on public.memberships (tenant_id);
create index memberships_unit_id_idx on public.memberships (unit_id);

create trigger set_tenants_updated_at
  before update on public.tenants
  for each row
  execute function public.set_updated_at();

create trigger set_units_updated_at
  before update on public.units
  for each row
  execute function public.set_updated_at();

create trigger set_memberships_updated_at
  before update on public.memberships
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Helper functions
--
-- `security definer` is required so these can be called from an RLS
-- policy on `memberships` itself without recursing back into RLS: the
-- function body runs with the privileges of its owner (bypassing RLS),
-- while `auth.uid()` still reflects the calling user's own session.
-- ---------------------------------------------------------------------

create or replace function public.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.is_tenant_admin(target_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'manager')
  );
$$;

revoke all on function public.is_tenant_member(uuid) from public;
revoke all on function public.is_tenant_admin(uuid) from public;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.is_tenant_admin(uuid) to authenticated;

-- Bootstraps a tenant plus its owner membership atomically and returns
-- the new row. This is the *only* way a client creates a tenant — there
-- is no direct INSERT policy on `tenants` — for two reasons:
--   1. Creating the tenant row and its owner membership must be atomic;
--      a bare INSERT + an AFTER trigger would leave a moment where the
--      tenant exists without an owner if anything in between failed.
--   2. `INSERT ... RETURNING` (what `supabase-js`'s `.insert().select()`
--      generates) re-checks the SELECT policy against the freshly
--      inserted row in the same statement. Since `tenants_select_member`
--      depends on a membership row, and that membership would only be
--      created by an AFTER INSERT trigger *on the same statement*, the
--      RETURNING check does not reliably see it yet and the insert is
--      rejected. Doing both writes inside one SECURITY DEFINER function
--      sidesteps that entirely: the function itself bypasses RLS, and it
--      returns the already-known row directly instead of forcing a
--      policy-checked RETURNING.
create or replace function public.create_tenant(tenant_name text, tenant_segment text default 'other')
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant public.tenants;
begin
  if auth.uid() is null then
    raise exception 'create_tenant requires an authenticated user';
  end if;

  insert into public.tenants (name, segment)
  values (tenant_name, tenant_segment)
  returning * into new_tenant;

  insert into public.memberships (tenant_id, user_id, role, status)
  values (new_tenant.id, auth.uid(), 'owner', 'active');

  return new_tenant;
end;
$$;

revoke all on function public.create_tenant(text, text) from public;
grant execute on function public.create_tenant(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.tenants force row level security;
alter table public.units enable row level security;
alter table public.units force row level security;
alter table public.memberships enable row level security;
alter table public.memberships force row level security;

-- Table-level grants only decide *whether* a role may attempt the
-- operation at all; the policies below still decide *which rows*.
-- `anon` intentionally gets nothing here — every one of these tables
-- requires an authenticated, tenant-scoped session.
-- No INSERT grant on tenants: creation only happens through
-- `create_tenant()` above, which runs as SECURITY DEFINER.
grant select, update on public.tenants to authenticated;
grant select, insert, update, delete on public.units to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;

-- tenants
create policy "tenants_select_member"
  on public.tenants
  for select
  to authenticated
  using (public.is_tenant_member(id));

-- Deliberately no INSERT policy: tenants are only created through the
-- `create_tenant()` SECURITY DEFINER function above.

create policy "tenants_update_admin"
  on public.tenants
  for update
  to authenticated
  using (public.is_tenant_admin(id))
  with check (public.is_tenant_admin(id));

-- No delete policy: tenants are archived via `status`, never hard-deleted
-- by client code (see docs/security.md).

-- units
create policy "units_select_member"
  on public.units
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy "units_insert_admin"
  on public.units
  for insert
  to authenticated
  with check (public.is_tenant_admin(tenant_id));

create policy "units_update_admin"
  on public.units
  for update
  to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "units_delete_admin"
  on public.units
  for delete
  to authenticated
  using (public.is_tenant_admin(tenant_id));

-- memberships
create policy "memberships_select_member"
  on public.memberships
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy "memberships_insert_admin"
  on public.memberships
  for insert
  to authenticated
  with check (public.is_tenant_admin(tenant_id));

create policy "memberships_update_admin"
  on public.memberships
  for update
  to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "memberships_delete_admin"
  on public.memberships
  for delete
  to authenticated
  using (public.is_tenant_admin(tenant_id));
