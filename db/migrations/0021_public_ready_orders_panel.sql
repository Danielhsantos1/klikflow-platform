-- Etapa 4/N: painel público de chamada (TV da loja), listando os
-- pedidos "Prontos" por senha. Mesmo cuidado das demais leituras
-- públicas (0014): nada de abrir uma policy de SELECT genérica em
-- `orders` para o role `anonymous` — só uma função que devolve
-- exatamente os campos que já ficam visíveis numa TV de balcão
-- (senha, nome, local), nunca o pedido inteiro.
create or replace function public.list_ready_orders(p_tenant_id uuid)
returns table (
  order_id uuid,
  pickup_number integer,
  customer_name text,
  location_label text,
  ready_since timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.pickup_number, o.customer_name, cl.label, o.updated_at
  from public.orders o
  join public.order_statuses os on os.id = o.status_id
  join public.tabs t on t.id = o.tab_id
  join public.consumption_locations cl on cl.id = t.consumption_location_id
  where o.tenant_id = p_tenant_id
    and os.key = 'ready'
  order by o.pickup_number nulls last, o.updated_at;
$$;

grant execute on function public.list_ready_orders(uuid) to anonymous;
