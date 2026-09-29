-- Pedido do usuário: o Painel TV deve mostrar no máximo 10 pedidos por
-- vez — quando um sai (toque ou os 30min de 0027), o próximo da fila
-- (por senha/ordem de prontidão) aparece sozinho no lugar. Só adiciona
-- LIMIT 10 ao ORDER BY que já existia (0024); o "next in line" já
-- acontecia naturalmente porque a lista inteira é recalculada a cada
-- poll do painel.
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
  order by o.pickup_number nulls last, o.updated_at
  limit 10;
$$;

-- Sem mudança de schema pro comportamento do Totem/QR/Tablet — é tudo
-- lógica de front-end (customer-order-page.tsx): o Totem para de
-- escutar `get_customer_order_status` depois de pagar (quem avisa
-- "pronto" pro cliente do Totem é o Painel TV, não a própria tela
-- compartilhada) e libera sozinho pro próximo cliente depois de alguns
-- segundos; QR Code e Tablet na Mesa continuam escutando e agora
-- piscam a tela (fundo da cor da marca) quando o pedido fica pronto.
