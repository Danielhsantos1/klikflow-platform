-- Fichas técnicas / CMV (Custo de Mercadoria Vendida) - lacuna
-- identificada comparando com concorrentes (Tairo): hoje `products` só
-- guarda o preço de VENDA, nada sobre custo. Sem isso o dono não sabe
-- se o preço cobre o custo do produto.
--
-- Mesmo padrão de `product_stations` (0007): tabela de ingredientes
-- por tenant + tabela de associação produto<->ingrediente com
-- quantidade. Não mexe em `products.price` nem em nada do pedido - é
-- só visibilidade de custo em cima do catálogo que já existe.

insert into public.permissions (key, description) values
  ('recipes.manage', 'Criar, editar e arquivar Ingredientes e Fichas Técnicas');

-- Tenants que já existem não ganham essa permissão nova sozinhos -
-- create_tenant() só dá "todas as permissões" no momento da criação do
-- tenant, não retroativamente. Dá pra quem já tinha catalog.manage
-- (mesmo escopo de quem mexe no cardápio).
insert into public.role_permissions (role_id, permission_key)
select r.id, 'recipes.manage'
from public.roles r
join public.role_permissions rp on rp.role_id = r.id and rp.permission_key = 'catalog.manage'
where not exists (
  select 1 from public.role_permissions existing
  where existing.role_id = r.id and existing.permission_key = 'recipes.manage'
);

-- ---------------------------------------------------------------------
-- ingredients
-- ---------------------------------------------------------------------
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  unit text not null check (unit in ('kg', 'g', 'l', 'ml', 'un')),
  cost_per_unit numeric(10, 4) not null check (cost_per_unit >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index ingredients_tenant_id_idx on public.ingredients (tenant_id);

create trigger set_ingredients_updated_at
  before update on public.ingredients
  for each row
  execute function public.set_updated_at();

alter table public.ingredients enable row level security;
alter table public.ingredients force row level security;

grant select, insert, update, delete on public.ingredients to authenticated;

create policy "ingredients_select_member"
  on public.ingredients
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy "ingredients_insert_admin"
  on public.ingredients
  for insert
  to authenticated
  with check (public.has_permission(tenant_id, 'recipes.manage'));

create policy "ingredients_update_admin"
  on public.ingredients
  for update
  to authenticated
  using (public.has_permission(tenant_id, 'recipes.manage'))
  with check (public.has_permission(tenant_id, 'recipes.manage'));

create policy "ingredients_delete_admin"
  on public.ingredients
  for delete
  to authenticated
  using (public.has_permission(tenant_id, 'recipes.manage'));

-- ---------------------------------------------------------------------
-- product_ingredients: a ficha técnica em si - produto <-> ingrediente
-- + quantidade usada (na mesma unidade do ingrediente).
-- ---------------------------------------------------------------------
create table public.product_ingredients (
  product_id uuid not null references public.products (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  quantity numeric(10, 4) not null check (quantity > 0),
  primary key (product_id, ingredient_id)
);

create index product_ingredients_ingredient_id_idx on public.product_ingredients (ingredient_id);

alter table public.product_ingredients enable row level security;
alter table public.product_ingredients force row level security;

grant select, insert, update, delete on public.product_ingredients to authenticated;

create policy "product_ingredients_select_member"
  on public.product_ingredients
  for select
  to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_ingredients.product_id
        and public.is_tenant_member(p.tenant_id)
    )
  );

create policy "product_ingredients_insert_admin"
  on public.product_ingredients
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_ingredients.product_id
        and public.has_permission(p.tenant_id, 'recipes.manage')
    )
    and exists (
      select 1 from public.ingredients i
      where i.id = product_ingredients.ingredient_id
        and i.tenant_id = (select p.tenant_id from public.products p where p.id = product_ingredients.product_id)
    )
  );

create policy "product_ingredients_update_admin"
  on public.product_ingredients
  for update
  to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_ingredients.product_id
        and public.has_permission(p.tenant_id, 'recipes.manage')
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_ingredients.product_id
        and public.has_permission(p.tenant_id, 'recipes.manage')
    )
  );

create policy "product_ingredients_delete_admin"
  on public.product_ingredients
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_ingredients.product_id
        and public.has_permission(p.tenant_id, 'recipes.manage')
    )
  );

-- create_tenant() já dá todas as permissões existentes ao Proprietário
-- (select key from permissions), então nenhuma alteração é necessária
-- nessa função - mesma observação da 0007.
