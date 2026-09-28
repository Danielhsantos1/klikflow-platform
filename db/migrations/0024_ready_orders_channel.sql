-- Etapa 4/N, refinamento: o Painel TV precisa saber a origem do pedido
-- (Totem/QR na mesa/lançado pela equipe) pra mostrar o selo certo -
-- list_ready_orders (0021) só devolvia senha/nome/local.
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
  order by o.pickup_number nulls last, o.updated_at;
$$;
