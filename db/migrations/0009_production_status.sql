-- Tarefa 06: Produção + status configurável.
--
-- `orders.status` (enum fixo da Tarefa 05) vira `orders.status_id`,
-- apontando para `order_statuses` — uma lista configurável POR TENANT,
-- com transições explicitamente permitidas em `order_status_transitions`.
-- Isso é o que a direção mestre pede: "o fluxo... deverá ser configurável
-- por empresa... as transições devem ser controladas".
--
-- Realtime (também citado no título da tarefa) fica para quando existir
-- uma tela consumindo esses eventos (Tarefa 07+) — construir a infra
-- agora, sem nenhum consumidor, seria trabalho especulativo.

insert into public.permissions (key, description) values
  ('orders.configure_statuses', 'Configurar os status de Pedido e as transições permitidas'),
  ('production.manage', 'Atualizar o progresso de um item nas Estações de Produção');

-- ---------------------------------------------------------------------
-- order_statuses: os status possíveis de um Pedido, configuráveis por
-- tenant. `sequence` define a ordem "natural" do fluxo (usada para
-- escolher o status inicial de um pedido novo); `is_terminal` marca um
-- status do qual nenhuma transição deveria mais existir (ex: finalizado,
-- cancelado).
-- ---------------------------------------------------------------------
create table public.order_statuses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null,
  label text not null,
  sequence integer not null,
  is_terminal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create index order_statuses_tenant_id_idx on public.order_statuses (tenant_id);

create trigger set_order_statuses_updated_at
  before update on public.order_statuses
  for each row
  execute function public.set_updated_at();

alter table public.order_statuses enable row level security;
alter table public.order_statuses force row level security;

grant select, insert, update, delete on public.order_statuses to authenticated;

create policy "order_statuses_select_member"
  on public.order_statuses
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy "order_statuses_insert_admin"
  on public.order_statuses
  for insert
  to authenticated
  with check (public.has_permission(tenant_id, 'orders.configure_statuses'));

create policy "order_statuses_update_admin"
  on public.order_statuses
  for update
  to authenticated
  using (public.has_permission(tenant_id, 'orders.configure_statuses'))
  with check (public.has_permission(tenant_id, 'orders.configure_statuses'));

create policy "order_statuses_delete_admin"
  on public.order_statuses
  for delete
  to authenticated
  using (public.has_permission(tenant_id, 'orders.configure_statuses'));
  -- Um status em uso por algum pedido não pode ser excluído: o FK
  -- `orders.status_id` (abaixo) referencia `order_statuses` sem cascade.

-- ---------------------------------------------------------------------
-- order_status_transitions: o grafo de transições permitidas.
-- ---------------------------------------------------------------------
create table public.order_status_transitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  from_status_id uuid not null references public.order_statuses (id) on delete cascade,
  to_status_id uuid not null references public.order_statuses (id) on delete cascade,
  unique (tenant_id, from_status_id, to_status_id)
);

create index order_status_transitions_tenant_id_idx on public.order_status_transitions (tenant_id);

alter table public.order_status_transitions enable row level security;
alter table public.order_status_transitions force row level security;

grant select, insert, delete on public.order_status_transitions to authenticated;

create policy "order_status_transitions_select_member"
  on public.order_status_transitions
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy "order_status_transitions_insert_admin"
  on public.order_status_transitions
  for insert
  to authenticated
  with check (public.has_permission(tenant_id, 'orders.configure_statuses'));

create policy "order_status_transitions_delete_admin"
  on public.order_status_transitions
  for delete
  to authenticated
  using (public.has_permission(tenant_id, 'orders.configure_statuses'));

-- ---------------------------------------------------------------------
-- orders.status (enum fixo) -> orders.status_id (configurável).
-- ---------------------------------------------------------------------
alter table public.orders add column status_id uuid references public.order_statuses (id);
alter table public.orders drop column status;

-- Se o cliente não informar um status_id no INSERT, usa o de menor
-- `sequence` do tenant (o "início" do fluxo configurado).
create or replace function public.default_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status_id is null then
    select id into new.status_id
    from public.order_statuses
    where tenant_id = new.tenant_id
    order by sequence asc
    limit 1;
  end if;

  if new.status_id is null then
    raise exception 'tenant % has no order_statuses configured', new.tenant_id;
  end if;

  return new;
end;
$$;

create trigger set_default_order_status
  before insert on public.orders
  for each row
  execute function public.default_order_status();

alter table public.orders alter column status_id set not null;

-- Nenhuma mudança de status_id é aceita a menos que exista uma
-- transição explícita para ela em order_status_transitions — é isso que
-- torna as transições "controladas" em vez de um UPDATE livre.
create or replace function public.validate_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status_id = old.status_id then
    return new;
  end if;

  if not exists (
    select 1 from public.order_status_transitions t
    where t.tenant_id = new.tenant_id
      and t.from_status_id = old.status_id
      and t.to_status_id = new.status_id
  ) then
    raise exception 'transition from % to % is not allowed for this tenant', old.status_id, new.status_id;
  end if;

  return new;
end;
$$;

create trigger validate_order_status_transition_trigger
  before update on public.orders
  for each row
  execute function public.validate_order_status_transition();

-- ---------------------------------------------------------------------
-- create_tenant(): agora também semeia o fluxo padrão de status
-- (Novo → Aceito → Em Produção → Pronto → Entregue → Finalizado, mais
-- Cancelado a partir de qualquer status não-terminal) para o tenant
-- novo. Um tenant pode reconfigurar isso depois via `orders.configure_statuses`.
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
  status_novo uuid;
  status_aceito uuid;
  status_producao uuid;
  status_pronto uuid;
  status_entregue uuid;
  status_finalizado uuid;
  status_cancelado uuid;
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

  insert into public.order_statuses (tenant_id, key, label, sequence, is_terminal)
  values
    (new_tenant.id, 'new', 'Novo', 1, false),
    (new_tenant.id, 'accepted', 'Aceito', 2, false),
    (new_tenant.id, 'in_production', 'Em Produção', 3, false),
    (new_tenant.id, 'ready', 'Pronto', 4, false),
    (new_tenant.id, 'delivered', 'Entregue', 5, false),
    (new_tenant.id, 'completed', 'Finalizado', 6, true),
    (new_tenant.id, 'cancelled', 'Cancelado', 99, true);

  select id into status_novo from public.order_statuses where tenant_id = new_tenant.id and key = 'new';
  select id into status_aceito from public.order_statuses where tenant_id = new_tenant.id and key = 'accepted';
  select id into status_producao from public.order_statuses where tenant_id = new_tenant.id and key = 'in_production';
  select id into status_pronto from public.order_statuses where tenant_id = new_tenant.id and key = 'ready';
  select id into status_entregue from public.order_statuses where tenant_id = new_tenant.id and key = 'delivered';
  select id into status_finalizado from public.order_statuses where tenant_id = new_tenant.id and key = 'completed';
  select id into status_cancelado from public.order_statuses where tenant_id = new_tenant.id and key = 'cancelled';

  insert into public.order_status_transitions (tenant_id, from_status_id, to_status_id)
  values
    (new_tenant.id, status_novo, status_aceito),
    (new_tenant.id, status_aceito, status_producao),
    (new_tenant.id, status_producao, status_pronto),
    (new_tenant.id, status_pronto, status_entregue),
    (new_tenant.id, status_entregue, status_finalizado),
    (new_tenant.id, status_novo, status_cancelado),
    (new_tenant.id, status_aceito, status_cancelado),
    (new_tenant.id, status_producao, status_cancelado),
    (new_tenant.id, status_pronto, status_cancelado);

  return new_tenant;
end;
$$;

-- ---------------------------------------------------------------------
-- order_item_stations: acompanha cada item do pedido passando pelas
-- Estações de Produção associadas ao produto (Tarefa 04). Semeado
-- automaticamente quando o item é criado — o cliente não escolhe por
-- quais estações o item passa, isso já está definido em
-- `product_stations`.
-- ---------------------------------------------------------------------
create table public.order_item_stations (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  station_id uuid not null references public.production_stations (id) on delete restrict,
  sequence integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_item_id, station_id)
);

create index order_item_stations_order_item_id_idx on public.order_item_stations (order_item_id);
create index order_item_stations_station_id_idx on public.order_item_stations (station_id);

create or replace function public.seed_order_item_stations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.order_item_stations (order_item_id, station_id, sequence)
  select new.id, ps.station_id, ps.sequence
  from public.product_stations ps
  where ps.product_id = new.product_id;

  return new;
end;
$$;

create trigger seed_order_item_stations_on_insert
  after insert on public.order_items
  for each row
  execute function public.seed_order_item_stations();

alter table public.order_item_stations enable row level security;
alter table public.order_item_stations force row level security;

-- Nenhum GRANT de INSERT/DELETE: as linhas só nascem/morrem via a
-- trigger (SECURITY DEFINER) acima, nunca diretamente pelo cliente.
grant select, update on public.order_item_stations to authenticated;

create policy "order_item_stations_select_member"
  on public.order_item_stations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_stations.order_item_id
        and public.is_tenant_member(o.tenant_id)
    )
  );

create policy "order_item_stations_update_production"
  on public.order_item_stations
  for update
  to authenticated
  using (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_stations.order_item_id
        and public.has_permission(o.tenant_id, 'production.manage')
    )
  )
  with check (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_stations.order_item_id
        and public.has_permission(o.tenant_id, 'production.manage')
    )
  );
