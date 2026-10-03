-- Totem (pedido pelo cliente, paga na hora): ganha seleção de forma de
-- pagamento (PIX/Débito/Crédito - sem Dinheiro, é autoatendimento sem
-- ninguém pra receber em espécie) antes de "pagar", igual já existe no
-- Caixa. confirm_customer_payment passa a receber e gravar o método
-- em orders.payment_method (0033) junto com paid_at (0035).
--
-- Adiciona um 4º parâmetro - `create or replace` não basta aqui porque
-- isso cria uma SEGUNDA função (overload), deixando uma chamada com 3
-- argumentos ambígua entre as duas. Derruba a assinatura antiga antes.
drop function if exists public.confirm_customer_payment(uuid, uuid, text);

create function public.confirm_customer_payment(
  p_token uuid,
  p_order_id uuid,
  p_customer_name text,
  p_payment_method text default null
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
  if p_payment_method is not null and p_payment_method not in ('pix', 'debit', 'credit') then
    raise exception 'invalid payment method for totem: %', p_payment_method;
  end if;

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
  set customer_name = nullif(trim(p_customer_name), ''),
      status_id = v_new_status_id,
      paid_at = now(),
      payment_method = p_payment_method
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

grant execute on function public.confirm_customer_payment(uuid, uuid, text, text) to anonymous;
