-- Tarefa 3/N da funcionalidade "Canais de Atendimento" (QR Code / Totem).
--
-- Um cliente sem conta não tem `auth.uid()` — nenhuma policy de RLS
-- existente (todas resolvem a partir de `is_tenant_member`/
-- `has_permission`, que dependem de uma membership) pode autorizá-lo.
-- Em vez de abrir uma policy genérica para o role `anonymous` (que
-- exigiria recriar, para um ator sem conta, toda a checagem de
-- isolamento que hoje só existe para membros), a escrita do cliente
-- passa inteira por estas 4 funções `SECURITY DEFINER` — o mesmo
-- padrão que `create_tenant()` já usa desde a Tarefa 02. Cada uma
-- valida no próprio corpo, contra o banco, que o `access_token`
-- apresentado corresponde a uma Comanda aberta antes de tocar em
-- qualquer linha — nunca confiam em `tenant_id`/`tab_id` vindos do
-- cliente sem essa prova.
--
-- Leitura pública do cardápio (categorias/produtos) fica para a
-- Tarefa 4/N, junto da primeira tela — não faz sentido validar RPCs de
-- escrita sem ainda ter decidido o desenho da leitura.

-- `orders.created_by`, como `tabs.opened_by` na Tarefa 2/N, não faz
-- sentido para um Pedido lançado pelo próprio cliente.
alter table public.orders
  alter column created_by drop not null;

-- ---------------------------------------------------------------------
-- open_customer_tab: abre uma Comanda de cliente (canal qr_code/totem)
-- para um Local de Consumo, e devolve o access_token que autentica
-- todas as chamadas seguintes desse cliente.
-- ---------------------------------------------------------------------
create or replace function public.open_customer_tab(p_location_id uuid, p_channel text)
returns public.tabs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_new_tab public.tabs;
begin
  if p_channel not in ('qr_code', 'totem') then
    raise exception 'invalid channel: %', p_channel;
  end if;

  select u.tenant_id into v_tenant_id
  from public.consumption_locations cl
  join public.units u on u.id = cl.unit_id
  where cl.id = p_location_id
    and cl.status = 'active';

  if v_tenant_id is null then
    raise exception 'location not found or inactive';
  end if;

  begin
    insert into public.tabs (tenant_id, consumption_location_id, channel, access_token)
    values (v_tenant_id, p_location_id, p_channel, gen_random_uuid())
    returning * into v_new_tab;
  exception
    when unique_violation then
      raise exception 'this location already has an open tab';
  end;

  return v_new_tab;
end;
$$;

grant execute on function public.open_customer_tab(uuid, text) to anonymous;

-- ---------------------------------------------------------------------
-- get_customer_tab: recupera a Comanda do cliente a partir do token —
-- usado para retomar a sessão (ex: recarregar a página).
-- ---------------------------------------------------------------------
create or replace function public.get_customer_tab(p_token uuid)
returns public.tabs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tab public.tabs;
begin
  select * into v_tab
  from public.tabs
  where access_token = p_token
    and status = 'open';

  if v_tab.id is null then
    raise exception 'invalid or expired access token';
  end if;

  return v_tab;
end;
$$;

grant execute on function public.get_customer_tab(uuid) to anonymous;

-- ---------------------------------------------------------------------
-- create_customer_order: cria um novo Pedido na Comanda do cliente.
-- ---------------------------------------------------------------------
create or replace function public.create_customer_order(p_token uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tab public.tabs;
  v_new_order public.orders;
begin
  select * into v_tab
  from public.tabs
  where access_token = p_token
    and status = 'open';

  if v_tab.id is null then
    raise exception 'invalid or expired access token';
  end if;

  insert into public.orders (tenant_id, tab_id)
  values (v_tab.tenant_id, v_tab.id)
  returning * into v_new_order;

  return v_new_order;
end;
$$;

grant execute on function public.create_customer_order(uuid) to anonymous;

-- ---------------------------------------------------------------------
-- add_customer_order_item: adiciona um item a um Pedido da Comanda do
-- cliente. `p_order_id` só é aceito se pertencer à MESMA Comanda que o
-- token resolve — nunca confia no id vindo do cliente sozinho.
-- ---------------------------------------------------------------------
create or replace function public.add_customer_order_item(
  p_token uuid,
  p_order_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_notes text default null
)
returns public.order_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tab public.tabs;
  v_order public.orders;
  v_product public.products;
  v_new_item public.order_items;
begin
  select * into v_tab
  from public.tabs
  where access_token = p_token
    and status = 'open';

  if v_tab.id is null then
    raise exception 'invalid or expired access token';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and tab_id = v_tab.id;

  if v_order.id is null then
    raise exception 'order not found for this tab';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
    and tenant_id = v_tab.tenant_id
    and status = 'active';

  if v_product.id is null then
    raise exception 'product not found or inactive for this tenant';
  end if;

  insert into public.order_items (order_id, product_id, quantity, notes)
  values (p_order_id, p_product_id, p_quantity, p_notes)
  returning * into v_new_item;

  return v_new_item;
end;
$$;

grant execute on function public.add_customer_order_item(uuid, uuid, uuid, integer, text) to anonymous;
