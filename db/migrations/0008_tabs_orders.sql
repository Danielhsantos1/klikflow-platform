-- Tarefa 05: núcleo transacional — Local de Consumo → Comanda → Pedido
-- → Itens.
--
-- Fluxo de status do pedido é fixo e simples nesta etapa (new → accepted
-- → in_production → ready → delivered → completed, + cancelled). A
-- máquina de transições CONFIGURÁVEL por tenant (impedir pular etapas,
-- customizar o fluxo) é escopo da Tarefa 06 — aqui só existe o enum e a
-- permissão que autoriza mudar o status, nada mais.

insert into public.permissions (key, description) values
  ('tabs.manage', 'Abrir e fechar Comandas'),
  ('orders.manage', 'Criar Pedidos e alterar seu status');

-- ---------------------------------------------------------------------
-- tabs (Comanda): agrupa o consumo de um Local de Consumo entre a
-- abertura e o fechamento.
-- ---------------------------------------------------------------------
create table public.tabs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  consumption_location_id uuid not null references public.consumption_locations (id) on delete restrict,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_by uuid not null references neon_auth."user" (id),
  closed_by uuid references neon_auth."user" (id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tabs_tenant_id_idx on public.tabs (tenant_id);
create index tabs_consumption_location_id_idx on public.tabs (consumption_location_id);
-- Só pode haver uma comanda aberta por vez em cada Local de Consumo.
create unique index tabs_one_open_per_location_idx on public.tabs (consumption_location_id) where status = 'open';

create trigger set_tabs_updated_at
  before update on public.tabs
  for each row
  execute function public.set_updated_at();

-- O Local de Consumo de uma comanda precisa ser do mesmo tenant —
-- mesmo motivo do check_product_category_same_tenant() da Tarefa 04.
create or replace function public.check_tab_location_same_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.consumption_locations cl
    join public.units u on u.id = cl.unit_id
    where cl.id = new.consumption_location_id
      and u.tenant_id = new.tenant_id
  ) then
    raise exception 'consumption location must belong to the same tenant as the tab';
  end if;
  return new;
end;
$$;

create trigger check_tab_location_tenant
  before insert or update on public.tabs
  for each row
  execute function public.check_tab_location_same_tenant();

alter table public.tabs enable row level security;
alter table public.tabs force row level security;

grant select, insert, update on public.tabs to authenticated;

create policy "tabs_select_member"
  on public.tabs
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy "tabs_insert_admin"
  on public.tabs
  for insert
  to authenticated
  with check (public.has_permission(tenant_id, 'tabs.manage'));

create policy "tabs_update_admin"
  on public.tabs
  for update
  to authenticated
  using (public.has_permission(tenant_id, 'tabs.manage'))
  with check (public.has_permission(tenant_id, 'tabs.manage'));

-- Nenhuma política de DELETE: uma comanda é fechada via `status`, nunca
-- excluída — ela é o registro histórico do consumo.

-- ---------------------------------------------------------------------
-- orders (Pedido): pertence a uma Comanda.
-- ---------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tab_id uuid not null references public.tabs (id) on delete restrict,
  status text not null default 'new'
    check (status in ('new', 'accepted', 'in_production', 'ready', 'delivered', 'completed', 'cancelled')),
  created_by uuid not null references neon_auth."user" (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_tenant_id_idx on public.orders (tenant_id);
create index orders_tab_id_idx on public.orders (tab_id);

create trigger set_orders_updated_at
  before update on public.orders
  for each row
  execute function public.set_updated_at();

-- A comanda de um pedido precisa ser do mesmo tenant, e precisa estar
-- aberta — não dá para lançar um pedido numa comanda já fechada.
create or replace function public.check_order_tab_same_tenant_and_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tab_row public.tabs;
begin
  select * into tab_row from public.tabs where id = new.tab_id;

  if tab_row.tenant_id <> new.tenant_id then
    raise exception 'tab must belong to the same tenant as the order';
  end if;

  if tg_op = 'INSERT' and tab_row.status <> 'open' then
    raise exception 'cannot add an order to a closed tab';
  end if;

  return new;
end;
$$;

create trigger check_order_tab_tenant
  before insert or update on public.orders
  for each row
  execute function public.check_order_tab_same_tenant_and_open();

alter table public.orders enable row level security;
alter table public.orders force row level security;

grant select, insert, update on public.orders to authenticated;

create policy "orders_select_member"
  on public.orders
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy "orders_insert_admin"
  on public.orders
  for insert
  to authenticated
  with check (public.has_permission(tenant_id, 'orders.manage'));

create policy "orders_update_admin"
  on public.orders
  for update
  to authenticated
  using (public.has_permission(tenant_id, 'orders.manage'))
  with check (public.has_permission(tenant_id, 'orders.manage'));

-- Nenhuma política de DELETE: um pedido é cancelado via `status`, nunca
-- excluído.

-- ---------------------------------------------------------------------
-- order_items: itens do pedido. `product_name`/`unit_price` são um
-- SNAPSHOT do produto no momento da compra — o cliente nunca escolhe
-- esses valores diretamente; a trigger abaixo sempre sobrescreve com o
-- que está em `products` no instante do INSERT, e o item nunca é
-- alterado depois (sem política de UPDATE/DELETE) — preserva o histórico
-- mesmo que o produto mude de preço ou seja arquivado depois.
-- ---------------------------------------------------------------------
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null,
  unit_price numeric(10, 2) not null,
  quantity integer not null check (quantity > 0),
  notes text,
  created_at timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

create or replace function public.snapshot_order_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product_row public.products;
  order_tenant_id uuid;
begin
  select tenant_id into order_tenant_id from public.orders where id = new.order_id;
  select * into product_row from public.products where id = new.product_id;

  if product_row.tenant_id <> order_tenant_id then
    raise exception 'product must belong to the same tenant as the order';
  end if;

  -- Ignora qualquer nome/preço enviado pelo cliente: o snapshot vem
  -- sempre do produto real no momento da compra.
  new.product_name := product_row.name;
  new.unit_price := product_row.price;

  return new;
end;
$$;

create trigger snapshot_order_item_on_insert
  before insert on public.order_items
  for each row
  execute function public.snapshot_order_item();

alter table public.order_items enable row level security;
alter table public.order_items force row level security;

-- Só SELECT e INSERT: nenhuma política de UPDATE/DELETE — um item já
-- lançado é histórico e não muda (corrigir uma quantidade errada vira
-- cancelar o pedido e lançar de novo, decisão que cabe a uma tarefa de
-- negócio futura, não a esta fundação).
grant select, insert on public.order_items to authenticated;

create policy "order_items_select_member"
  on public.order_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.is_tenant_member(o.tenant_id)
    )
  );

create policy "order_items_insert_admin"
  on public.order_items
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.has_permission(o.tenant_id, 'orders.manage')
    )
  );
