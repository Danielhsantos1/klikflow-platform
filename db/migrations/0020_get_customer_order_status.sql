-- Etapa 3/N: a tela do cliente, depois de "pagar", fica esperando o
-- pedido ficar pronto (polling, sem WebSocket/Realtime ainda - decisão
-- da Tarefa 1/N: infra nova sem consumidor é trabalho especulativo).
-- Precisa consultar o status do próprio pedido sem virar uma policy de
-- SELECT aberta em `orders` pro role `anonymous` - mesmo padrão
-- token+SECURITY DEFINER das demais chamadas do cliente.
create or replace function public.get_customer_order_status(p_token uuid, p_order_id uuid)
returns table (status_key text, status_label text, pickup_number integer)
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

  return query
    select os.key, os.label, o.pickup_number
    from public.orders o
    join public.order_statuses os on os.id = o.status_id
    where o.id = p_order_id
      and o.tab_id = v_tab.id;
end;
$$;

grant execute on function public.get_customer_order_status(uuid, uuid) to anonymous;
