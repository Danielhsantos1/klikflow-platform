-- O Totem é um aparelho compartilhado, não uma mesa de um cliente só —
-- diferente do QR Code/Tablet na Mesa, ninguém da equipe "fecha a
-- comanda" dele manualmente quando o cliente sai. Até aqui, a Comanda
-- do Totem ficava aberta indefinidamente depois do pagamento (só um
-- staff fechando manualmente em Comandas liberava o aparelho de novo),
-- o que trava `tabs_one_open_per_location_idx` e impede o próximo
-- cliente de começar um pedido no mesmo Totem.
--
-- Fechar a Comanda automaticamente assim que o pagamento é confirmado
-- resolve isso: o pedido já está identificado por senha (pickup_number),
-- não depende mais da Comanda estar aberta, e o Totem libera na hora
-- pro próximo cliente. QR Code e Tablet na Mesa continuam abertos —
-- são uma mesa de verdade, cuja Comanda a equipe fecha quando o
-- cliente vai embora (pode ter mais de um pedido na mesma visita).

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

  if v_tab.channel = 'totem' then
    update public.tabs
    set status = 'closed', closed_at = now()
    where id = v_tab.id;
  end if;

  return v_order;
end;
$$;

-- `get_customer_order_status` não pode mais exigir Comanda aberta — o
-- Totem fecha a própria Comanda no passo acima, mas o access_token
-- continua sendo a prova de posse válida (é secreto e único) pro
-- cliente continuar acompanhando o pedido até "Pronto".
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
  where access_token = p_token;

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
