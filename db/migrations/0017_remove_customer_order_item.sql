-- Espelha o remove_customer_order_item da tela do cliente para o padrao
-- token+RPC das Tarefas 3/N: o cliente nunca ganha uma policy de DELETE
-- direto (ele nem tem auth.uid()) - a funcao valida, contra o proprio
-- access_token, que o item pertence a uma Comanda aberta desse cliente
-- antes de apagar. Mesma regra de negocio da remocao pelo staff
-- (0016): so deixa remover enquanto o pedido ainda nao entrou em
-- producao (status new/awaiting_payment) - preserva o historico do que
-- ja foi para a cozinha.
create or replace function public.remove_customer_order_item(p_token uuid, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tab public.tabs;
  v_item public.order_items;
  v_status_key text;
begin
  select * into v_tab
  from public.tabs
  where access_token = p_token
    and status = 'open';

  if v_tab.id is null then
    raise exception 'invalid or expired access token';
  end if;

  select oi.* into v_item
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_item_id
    and o.tab_id = v_tab.id;

  if v_item.id is null then
    raise exception 'item not found for this tab';
  end if;

  select os.key into v_status_key
  from public.orders o
  join public.order_statuses os on os.id = o.status_id
  where o.id = v_item.order_id;

  if v_status_key not in ('new', 'awaiting_payment') then
    raise exception 'this order can no longer be edited';
  end if;

  delete from public.order_items where id = p_item_id;
end;
$$;

grant execute on function public.remove_customer_order_item(uuid, uuid) to anonymous;
