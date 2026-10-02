-- Reestruturação de pagamento (decisão do usuário): "status do pedido"
-- (fluxo de cozinha: new -> in_production -> ready -> delivered) e
-- "pagamento" deixam de ser a mesma coisa. Até aqui os dois eram o
-- mesmo campo (`status_id`), o que só fazia sentido pro Totem (paga na
-- hora, pedido único). Pra QR Code, Tablet na Mesa e Atendente
-- (Comandas), o cliente deve poder pedir mais itens à vontade - eles
-- vão pra produção na hora - e só pagar tudo de uma vez no Caixa,
-- quando for embora.
--
-- `paid_at` é independente do status_id: fica null enquanto o pedido
-- não foi pago (não bloqueia produção pra ninguém além do Totem), e
-- recebe a hora do pagamento quando o Caixa fecha a comanda (ou, pro
-- Totem, no mesmo instante que paga, via confirm_customer_payment).
alter table public.orders add column paid_at timestamptz;

-- `default_order_status()` (0009) escolhia sempre o status de menor
-- `sequence` do tenant - hoje isso é sempre "Aguardando pagamento"
-- (sequence 0), pra TODO pedido, de qualquer canal. Passa a decidir
-- pelo canal da comanda: só o Totem nasce "Aguardando pagamento" (quem
-- paga por fora disso é o próprio pagamento simulado do totem, via
-- confirm_customer_payment); os demais canais (staff/qr_code/
-- tablet_mesa) nascem direto em "Novo" - vão pra produção na hora, sem
-- esperar pagamento nenhum.
create or replace function public.default_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel text;
  v_status_key text;
begin
  if new.status_id is not null then
    return new;
  end if;

  select t.channel into v_channel
  from public.tabs t
  where t.id = new.tab_id;

  v_status_key := case when v_channel = 'totem' then 'awaiting_payment' else 'new' end;

  select id into new.status_id
  from public.order_statuses
  where tenant_id = new.tenant_id and key = v_status_key;

  if new.status_id is null then
    raise exception 'tenant % has no "%" status configured', new.tenant_id, v_status_key;
  end if;

  return new;
end;
$$;

-- confirm_customer_payment (usado só pelo Totem a partir de agora)
-- passa a gravar paid_at também - antes só mudava o status_id.
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
  set customer_name = nullif(trim(p_customer_name), ''), status_id = v_new_status_id, paid_at = now()
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
