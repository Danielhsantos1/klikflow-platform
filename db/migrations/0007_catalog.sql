-- Tarefa 04: Catálogo (categorias, produtos, preços, imagens), Estações
-- de Produção e Locais de Consumo.
--
-- Preço/histórico: esta tabela guarda o preço ATUAL do produto. Um
-- pedido futuro (Tarefa 05) deve gravar o preço no momento da compra no
-- próprio item do pedido (snapshot), nunca ler o preço vigente de
-- `products` depois do fato — ver docs/database.md.

-- ---------------------------------------------------------------------
-- Novas permissões do catálogo global. `create_tenant()` já concede
-- automaticamente TODAS as permissões existentes ao Perfil
-- "Proprietário" (faz `select key from permissions`), então nenhuma
-- alteração é necessária nessa função para tenants futuros.
-- ---------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('catalog.manage', 'Criar, editar e arquivar Categorias e Produtos'),
  ('production_stations.manage', 'Criar, editar e arquivar Estações de Produção'),
  ('consumption_locations.manage', 'Criar, editar e arquivar Locais de Consumo');

-- ---------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index categories_tenant_id_idx on public.categories (tenant_id);

create trigger set_categories_updated_at
  before update on public.categories
  for each row
  execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.categories force row level security;

grant select, insert, update, delete on public.categories to authenticated;

create policy "categories_select_member"
  on public.categories
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy "categories_insert_admin"
  on public.categories
  for insert
  to authenticated
  with check (public.has_permission(tenant_id, 'catalog.manage'));

create policy "categories_update_admin"
  on public.categories
  for update
  to authenticated
  using (public.has_permission(tenant_id, 'catalog.manage'))
  with check (public.has_permission(tenant_id, 'catalog.manage'));

create policy "categories_delete_admin"
  on public.categories
  for delete
  to authenticated
  using (public.has_permission(tenant_id, 'catalog.manage'));

-- ---------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  description text,
  price numeric(10, 2) not null check (price >= 0),
  image_url text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_tenant_id_idx on public.products (tenant_id);
create index products_category_id_idx on public.products (category_id);

create trigger set_products_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.products force row level security;

grant select, insert, update, delete on public.products to authenticated;

create policy "products_select_member"
  on public.products
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy "products_insert_admin"
  on public.products
  for insert
  to authenticated
  with check (public.has_permission(tenant_id, 'catalog.manage'));

create policy "products_update_admin"
  on public.products
  for update
  to authenticated
  using (public.has_permission(tenant_id, 'catalog.manage'))
  with check (public.has_permission(tenant_id, 'catalog.manage'));

create policy "products_delete_admin"
  on public.products
  for delete
  to authenticated
  using (public.has_permission(tenant_id, 'catalog.manage'));

-- A categoria de um produto tem que ser da mesma empresa do produto —
-- sem isso, RLS por si só não impede vincular um produto do tenant A a
-- uma categoria do tenant B (ambos passariam suas próprias checagens de
-- policy isoladamente). Enforce isso com um trigger, não só com a FK.
create or replace function public.check_product_category_same_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id and c.tenant_id = new.tenant_id
  ) then
    raise exception 'category must belong to the same tenant as the product';
  end if;
  return new;
end;
$$;

create trigger check_product_category_tenant
  before insert or update on public.products
  for each row
  execute function public.check_product_category_same_tenant();

-- ---------------------------------------------------------------------
-- production_stations (Estação de Produção)
-- ---------------------------------------------------------------------
create table public.production_stations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index production_stations_tenant_id_idx on public.production_stations (tenant_id);

create trigger set_production_stations_updated_at
  before update on public.production_stations
  for each row
  execute function public.set_updated_at();

alter table public.production_stations enable row level security;
alter table public.production_stations force row level security;

grant select, insert, update, delete on public.production_stations to authenticated;

create policy "production_stations_select_member"
  on public.production_stations
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy "production_stations_insert_admin"
  on public.production_stations
  for insert
  to authenticated
  with check (public.has_permission(tenant_id, 'production_stations.manage'));

create policy "production_stations_update_admin"
  on public.production_stations
  for update
  to authenticated
  using (public.has_permission(tenant_id, 'production_stations.manage'))
  with check (public.has_permission(tenant_id, 'production_stations.manage'));

create policy "production_stations_delete_admin"
  on public.production_stations
  for delete
  to authenticated
  using (public.has_permission(tenant_id, 'production_stations.manage'));

-- ---------------------------------------------------------------------
-- product_stations: associação produto ↔ estação(s). Um produto pode
-- passar por várias estações em sequência (ex: Chapa → Montagem →
-- Expedição).
-- ---------------------------------------------------------------------
create table public.product_stations (
  product_id uuid not null references public.products (id) on delete cascade,
  station_id uuid not null references public.production_stations (id) on delete cascade,
  sequence integer not null default 0,
  primary key (product_id, station_id)
);

create index product_stations_station_id_idx on public.product_stations (station_id);

alter table public.product_stations enable row level security;
alter table public.product_stations force row level security;

grant select, insert, update, delete on public.product_stations to authenticated;

create policy "product_stations_select_member"
  on public.product_stations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_stations.product_id
        and public.is_tenant_member(p.tenant_id)
    )
  );

create policy "product_stations_insert_admin"
  on public.product_stations
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_stations.product_id
        and public.has_permission(p.tenant_id, 'catalog.manage')
    )
    and exists (
      select 1 from public.production_stations s
      where s.id = product_stations.station_id
        and s.tenant_id = (select p.tenant_id from public.products p where p.id = product_stations.product_id)
    )
  );

create policy "product_stations_update_admin"
  on public.product_stations
  for update
  to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_stations.product_id
        and public.has_permission(p.tenant_id, 'catalog.manage')
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_stations.product_id
        and public.has_permission(p.tenant_id, 'catalog.manage')
    )
  );

create policy "product_stations_delete_admin"
  on public.product_stations
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_stations.product_id
        and public.has_permission(p.tenant_id, 'catalog.manage')
    )
  );

-- ---------------------------------------------------------------------
-- consumption_locations (Local de Consumo) — pertence a uma Unidade,
-- não diretamente ao tenant (Tenant → Unit → Local de Consumo).
-- ---------------------------------------------------------------------
create table public.consumption_locations (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete cascade,
  label text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, label)
);

create index consumption_locations_unit_id_idx on public.consumption_locations (unit_id);

create trigger set_consumption_locations_updated_at
  before update on public.consumption_locations
  for each row
  execute function public.set_updated_at();

alter table public.consumption_locations enable row level security;
alter table public.consumption_locations force row level security;

grant select, insert, update, delete on public.consumption_locations to authenticated;

create policy "consumption_locations_select_member"
  on public.consumption_locations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.units u
      where u.id = consumption_locations.unit_id
        and public.is_tenant_member(u.tenant_id)
    )
  );

create policy "consumption_locations_insert_admin"
  on public.consumption_locations
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.units u
      where u.id = consumption_locations.unit_id
        and public.has_permission(u.tenant_id, 'consumption_locations.manage')
    )
  );

create policy "consumption_locations_update_admin"
  on public.consumption_locations
  for update
  to authenticated
  using (
    exists (
      select 1 from public.units u
      where u.id = consumption_locations.unit_id
        and public.has_permission(u.tenant_id, 'consumption_locations.manage')
    )
  )
  with check (
    exists (
      select 1 from public.units u
      where u.id = consumption_locations.unit_id
        and public.has_permission(u.tenant_id, 'consumption_locations.manage')
    )
  );

create policy "consumption_locations_delete_admin"
  on public.consumption_locations
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.units u
      where u.id = consumption_locations.unit_id
        and public.has_permission(u.tenant_id, 'consumption_locations.manage')
    )
  );
