-- O Painel TV só listava pedidos "Pronto" e nada nunca tirava eles de
-- lá — não existia UI nenhuma pra avançar um pedido pra "Entregue", só
-- o pedido ficava acumulando pra sempre até a lista virar uma
-- rolagem infinita ("Tá ficando muitos itens na lista da TV").
--
-- Duas partes:
--   1. `mark_order_delivered`: RPC pública (mesmo padrão token-less das
--      outras leituras públicas do Painel TV, mas aqui é uma escrita —
--      só move 'ready' -> 'delivered', que já é uma transição válida
--      no grafo de `order_status_transitions` desde a Tarefa 09; não dá
--      pra "roubar" nenhum pedido de outro tenant porque o filtro por
--      tenant_id é obrigatório e o status de origem é travado em
--      'ready'). Pensada pra um toque na própria tela da TV (se for
--      touch) ou um botão em Comandas/Produção.
--   2. Rede de segurança: `list_ready_orders` para de mostrar um pedido
--      "Pronto" há mais de 30 minutos, pro caso de ninguém tocar nele -
--      a Comanda/pedido continuam existindo normalmente, só somem do
--      Painel.
create or replace function public.mark_order_delivered(p_tenant_id uuid, p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_delivered_status_id uuid;
begin
  select * into v_order
  from public.orders o
  join public.order_statuses os on os.id = o.status_id
  where o.id = p_order_id
    and o.tenant_id = p_tenant_id
    and os.key = 'ready';

  if v_order.id is null then
    raise exception 'order not found, not ready, or belongs to a different tenant';
  end if;

  select id into v_delivered_status_id
  from public.order_statuses
  where tenant_id = p_tenant_id and key = 'delivered';

  if v_delivered_status_id is null then
    raise exception 'tenant % has no "delivered" status configured', p_tenant_id;
  end if;

  update public.orders
  set status_id = v_delivered_status_id
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.mark_order_delivered(uuid, uuid) to anonymous;

create or replace function public.list_ready_orders(p_tenant_id uuid)
returns table (
  order_id uuid,
  pickup_number integer,
  customer_name text,
  location_label text,
  channel text,
  ready_since timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.pickup_number, o.customer_name, cl.label, t.channel, o.updated_at
  from public.orders o
  join public.order_statuses os on os.id = o.status_id
  join public.tabs t on t.id = o.tab_id
  join public.consumption_locations cl on cl.id = t.consumption_location_id
  where o.tenant_id = p_tenant_id
    and os.key = 'ready'
    and o.updated_at > now() - interval '30 minutes'
  order by o.pickup_number nulls last, o.updated_at;
$$;
