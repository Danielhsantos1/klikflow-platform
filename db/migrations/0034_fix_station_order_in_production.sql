-- Regressão introduzida pela 0031: pedidos COM item vinculado a Estação
-- de Produção nunca tinham seu `status_id` real avançado pra
-- "in_production" - só `order_item_stations` mudava (via UI,
-- production-board.tsx). O status do pedido ficava em "new" o tempo
-- todo, e só virava "ready" através do auto-avanço de
-- `check_order_ready_after_station_update` (0018), que fazia esse
-- UPDATE new->ready direto. A 0031 removeu exatamente essa aresta
-- achando que só sustentava um atalho indevido da UI - na verdade esse
-- trigger legítimo também dependia dela, e passou a falhar
-- ("transition from new to ready is not allowed") assim que o último
-- item de um pedido com estação era concluído.
--
-- Correção arquitetural (não é só recolocar a aresta): agora o pedido
-- COM estação também passa de verdade por "in_production" no banco
-- quando a produção começa (production-board.tsx vai fazer esse UPDATE
-- também, não só mexer em order_item_stations) - exatamente como já
-- acontecia pro pedido SEM estação (0030). O trigger passa a esperar
-- "in_production" (não mais "new") antes do auto-avanço pra "ready",
-- usando a aresta in_production->ready que já existe desde sempre.
create or replace function public.check_order_ready_after_station_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_tenant_id uuid;
  v_status_key text;
  v_ready_status_id uuid;
  v_pending_count integer;
begin
  if new.status <> 'done' then
    return new;
  end if;

  select oi.order_id into v_order_id
  from public.order_items oi
  where oi.id = new.order_item_id;

  select o.tenant_id, os.key into v_tenant_id, v_status_key
  from public.orders o
  join public.order_statuses os on os.id = o.status_id
  where o.id = v_order_id;

  if v_status_key <> 'in_production' then
    return new;
  end if;

  select count(*) into v_pending_count
  from public.order_item_stations ois
  join public.order_items oi on oi.id = ois.order_item_id
  where oi.order_id = v_order_id
    and ois.status <> 'done';

  if v_pending_count = 0 then
    select id into v_ready_status_id
    from public.order_statuses
    where tenant_id = v_tenant_id and key = 'ready';

    if v_ready_status_id is not null then
      update public.orders set status_id = v_ready_status_id where id = v_order_id;
    end if;
  end if;

  return new;
end;
$$;
