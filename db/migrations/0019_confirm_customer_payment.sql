-- Etapa 2/N: o cliente informa o nome e "paga" (ainda simulado - sem
-- gateway, decisão já tomada na Tarefa 5/N) pelo próprio totem/tablet,
-- em vez de esperar um funcionário confirmar manualmente. Mesmo padrão
-- token+SECURITY DEFINER das demais chamadas do cliente (0013).
--
-- A troca de status_id passa pelos triggers da Etapa 1/N
-- (assign_pickup_number, on_order_status_changed) automaticamente -
-- esta função só precisa validar a posse do pedido e fazer o UPDATE.
create or replace function public.confirm_customer_payment(
  p_token uuid,
  p_order_id uuid,
  p_customer_name text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tab public.tabs;
  v_order public.orders;
  v_new_status_id uuid;
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

  select id into v_new_status_id
  from public.order_statuses
  where tenant_id = v_tab.tenant_id and key = 'new';

  if v_new_status_id is null then
    raise exception 'tenant % has no "new" status configured', v_tab.tenant_id;
  end if;

  update public.orders
  set customer_name = nullif(trim(p_customer_name), ''), status_id = v_new_status_id
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.confirm_customer_payment(uuid, uuid, text) to anonymous;
