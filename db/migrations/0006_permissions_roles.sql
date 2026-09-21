-- Tarefa 03: sistema configurável de perfis/permissões, substituindo o
-- enum fixo `memberships.role` (owner/manager/staff) introduzido na
-- Tarefa 02 só como o mínimo necessário para a RLS funcionar.
--
-- Vocabulário: Usuário → Perfil (role) → Permissões → Função.
-- "role" aqui é sinônimo de "perfil" — evitado esse nome para não colidir
-- com `public.profiles` (dados do usuário), que já existe.

-- ---------------------------------------------------------------------
-- permissions: catálogo global e fixo (definido em código/migration, não
-- pelo tenant). Cada permissão representa uma ação sobre um recurso do
-- CORE. Novas permissões nascem em migrations futuras conforme novos
-- recursos de negócio forem criados (produtos, pedidos, pagamentos...).
-- ---------------------------------------------------------------------
create table public.permissions (
  key text primary key,
  description text not null
);

insert into public.permissions (key, description) values
  ('tenant.manage', 'Editar dados e configurações da Empresa'),
  ('units.manage', 'Criar, editar e arquivar Unidades'),
  ('memberships.manage', 'Convidar, remover e alterar o perfil de usuários da Empresa'),
  ('roles.manage', 'Criar, editar e excluir Perfis e suas permissões'),
  ('audit_log.read', 'Consultar a trilha de auditoria da Empresa');

alter table public.permissions enable row level security;
alter table public.permissions force row level security;

-- Catálogo somente leitura para qualquer usuário autenticado — é preciso
-- enxergar todas as permissões existentes para poder montar um Perfil.
-- Nenhuma política de INSERT/UPDATE/DELETE: o catálogo só muda via
-- migration.
grant select on public.permissions to authenticated;

create policy "permissions_select_authenticated"
  on public.permissions
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- roles: Perfis configuráveis por Empresa (não fixos como
-- admin/garçom/cozinha). `is_system` marca o Perfil de dono criado
-- automaticamente por `create_tenant()`, que nunca pode ser renomeado
-- nem excluído — garante que uma Empresa nunca fique sem dono.
-- ---------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index roles_tenant_id_idx on public.roles (tenant_id);

create trigger set_roles_updated_at
  before update on public.roles
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- role_permissions: liga um Perfil às Permissões que ele concede.
-- ---------------------------------------------------------------------
create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);

create index role_permissions_role_id_idx on public.role_permissions (role_id);

-- ---------------------------------------------------------------------
-- has_permission: substitui is_tenant_admin() da Tarefa 02. Resolve a
-- partir de auth.uid() — nunca de um valor enviado pelo cliente — se a
-- membership ativa do usuário nesse tenant tem, através do seu Perfil,
-- a permissão pedida.
-- ---------------------------------------------------------------------
create or replace function public.has_permission(target_tenant_id uuid, perm_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and rp.permission_key = perm_key
  );
$$;

revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated;

drop function if exists public.is_tenant_admin(uuid);

-- ---------------------------------------------------------------------
-- Protege o Perfil de dono (is_system): nunca pode ser renomeado nem
-- excluído. Sem isso, `roles.manage` deixaria alguém apagar o único
-- Perfil que sempre tem `tenant.manage`, e travaria a Empresa.
-- ---------------------------------------------------------------------
create or replace function public.protect_system_role()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'the owner role cannot be deleted';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.is_system and (new.name <> old.name or new.is_system is distinct from old.is_system) then
    raise exception 'the owner role cannot be renamed or demoted';
  end if;
  return new;
end;
$$;

create trigger protect_system_role_update
  before update on public.roles
  for each row
  execute function public.protect_system_role();

create trigger protect_system_role_delete
  before delete on public.roles
  for each row
  execute function public.protect_system_role();

-- ---------------------------------------------------------------------
-- Protege contra uma Empresa ficar sem dono: bloqueia excluir uma
-- membership, ou trocar seu Perfil para um que não seja o de sistema,
-- quando ela é a última membership ativa com o Perfil de dono do tenant.
-- ---------------------------------------------------------------------
create or replace function public.protect_last_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
  remaining_owners integer;
begin
  target := old;

  -- Só nos importa se a linha afetada era uma membership de dono ativa.
  if target.status <> 'active' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if not exists (
    select 1 from public.roles r
    where r.id = target.role_id and r.is_system
  ) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select count(*) into remaining_owners
  from public.memberships m
  join public.roles r on r.id = m.role_id
  where m.tenant_id = target.tenant_id
    and r.is_system
    and m.status = 'active'
    and m.id <> target.id;

  if remaining_owners = 0 then
    if tg_op = 'DELETE' then
      raise exception 'cannot remove the last owner of a tenant';
    end if;
    if tg_op = 'UPDATE' and (new.role_id <> old.role_id or new.status <> 'active') then
      raise exception 'cannot demote or deactivate the last owner of a tenant';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger protect_last_owner_delete
  before delete on public.memberships
  for each row
  execute function public.protect_last_owner_membership();

create trigger protect_last_owner_update
  before update on public.memberships
  for each row
  execute function public.protect_last_owner_membership();

-- ---------------------------------------------------------------------
-- memberships: troca o enum fixo `role` por `role_id`, apontando para um
-- Perfil configurável da própria Empresa.
-- ---------------------------------------------------------------------
alter table public.memberships add column role_id uuid references public.roles (id);
alter table public.memberships drop column role;
alter table public.memberships alter column role_id set not null;

create index memberships_role_id_idx on public.memberships (role_id);

-- ---------------------------------------------------------------------
-- create_tenant(): agora também cria o Perfil de dono (is_system) com
-- todas as permissões do catálogo, e a membership aponta para esse
-- Perfil em vez do texto 'owner'.
-- ---------------------------------------------------------------------
create or replace function public.create_tenant(tenant_name text, tenant_segment text default 'other')
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant public.tenants;
  owner_role_id uuid;
begin
  if auth.uid() is null then
    raise exception 'create_tenant requires an authenticated user';
  end if;

  insert into public.tenants (name, segment)
  values (tenant_name, tenant_segment)
  returning * into new_tenant;

  insert into public.roles (tenant_id, name, is_system)
  values (new_tenant.id, 'Proprietário', true)
  returning id into owner_role_id;

  insert into public.role_permissions (role_id, permission_key)
  select owner_role_id, key from public.permissions;

  insert into public.memberships (tenant_id, user_id, role_id, status)
  values (new_tenant.id, auth.uid(), owner_role_id, 'active');

  return new_tenant;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS: roles e role_permissions
-- ---------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.roles force row level security;
alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;

grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, delete on public.role_permissions to authenticated;

create policy "roles_select_member"
  on public.roles
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy "roles_insert_admin"
  on public.roles
  for insert
  to authenticated
  with check (public.has_permission(tenant_id, 'roles.manage'));

create policy "roles_update_admin"
  on public.roles
  for update
  to authenticated
  using (public.has_permission(tenant_id, 'roles.manage'))
  with check (public.has_permission(tenant_id, 'roles.manage'));

create policy "roles_delete_admin"
  on public.roles
  for delete
  to authenticated
  using (public.has_permission(tenant_id, 'roles.manage'));

create policy "role_permissions_select_member"
  on public.role_permissions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and public.is_tenant_member(r.tenant_id)
    )
  );

create policy "role_permissions_insert_admin"
  on public.role_permissions
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and public.has_permission(r.tenant_id, 'roles.manage')
    )
  );

create policy "role_permissions_delete_admin"
  on public.role_permissions
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and public.has_permission(r.tenant_id, 'roles.manage')
    )
  );

-- ---------------------------------------------------------------------
-- Atualiza as policies da Tarefa 02 que usavam is_tenant_admin()
-- ---------------------------------------------------------------------
drop policy "tenants_update_admin" on public.tenants;
create policy "tenants_update_admin"
  on public.tenants
  for update
  to authenticated
  using (public.has_permission(id, 'tenant.manage'))
  with check (public.has_permission(id, 'tenant.manage'));

drop policy "units_insert_admin" on public.units;
create policy "units_insert_admin"
  on public.units
  for insert
  to authenticated
  with check (public.has_permission(tenant_id, 'units.manage'));

drop policy "units_update_admin" on public.units;
create policy "units_update_admin"
  on public.units
  for update
  to authenticated
  using (public.has_permission(tenant_id, 'units.manage'))
  with check (public.has_permission(tenant_id, 'units.manage'));

drop policy "units_delete_admin" on public.units;
create policy "units_delete_admin"
  on public.units
  for delete
  to authenticated
  using (public.has_permission(tenant_id, 'units.manage'));

drop policy "memberships_insert_admin" on public.memberships;
create policy "memberships_insert_admin"
  on public.memberships
  for insert
  to authenticated
  with check (public.has_permission(tenant_id, 'memberships.manage'));

drop policy "memberships_update_admin" on public.memberships;
create policy "memberships_update_admin"
  on public.memberships
  for update
  to authenticated
  using (public.has_permission(tenant_id, 'memberships.manage'))
  with check (public.has_permission(tenant_id, 'memberships.manage'));

drop policy "memberships_delete_admin" on public.memberships;
create policy "memberships_delete_admin"
  on public.memberships
  for delete
  to authenticated
  using (public.has_permission(tenant_id, 'memberships.manage'));

drop policy "audit_log_select_admin" on public.audit_log;
create policy "audit_log_select_admin"
  on public.audit_log
  for select
  to authenticated
  using (
    tenant_id is not null
    and public.has_permission(tenant_id, 'audit_log.read')
  );
