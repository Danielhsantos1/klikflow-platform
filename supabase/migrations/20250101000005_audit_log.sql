-- audit_log: append-only trail for sensitive actions across the tenant
-- hierarchy. `tenant_id` is nullable to also allow future platform-level
-- (SaaS Admin) entries that are not scoped to a single tenant.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_tenant_id_idx on public.audit_log (tenant_id);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

-- Only SELECT is granted: writes must go through the service role
-- (see the policy comment below), so `authenticated` gets no
-- insert/update/delete grant at the table level at all.
grant select on public.audit_log to authenticated;

-- Tenant admins can review their own tenant's audit trail.
create policy "audit_log_select_admin"
  on public.audit_log
  for select
  to authenticated
  using (
    tenant_id is not null
    and public.is_tenant_admin(tenant_id)
  );

-- Deliberately no insert/update/delete policy for `authenticated` or
-- `anon`: entries must never be client-writable (a user must not be able
-- to author their own audit trail). Writes happen through triggers or
-- server-side code running with the service role, which bypasses RLS.
