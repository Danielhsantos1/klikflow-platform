-- Bug reportado: pedido com produtos sem Estação de Produção vinculada
-- virava "Pronto" sozinho no instante do pagamento, sem ninguém no
-- balcão confirmar nada - `on_order_status_changed` (0018) contava
-- "quantas estações pendentes esse pedido tem" e, como zero estação
-- vinculada = zero pendência, disparava o auto-avanço pra "Pronto" na
-- hora que o pedido entrava em "Novo". Isso fazia sentido só pro caso
-- de um produto 100% pronto (lata de refrigerante), mas a equipe quer
-- controle manual sempre: ninguém deve aparecer na TV sem o balcão
-- liberar.
--
-- Mantém intacto o auto-avanço de `check_order_ready_after_station_update`
-- (quando a Produção termina manualmente TODOS os itens com estação,
-- o pedido ainda vira "Pronto" sozinho - isso já exige ação humana por
-- item, é o fluxo correto). Só remove o avanço automático "de graça" no
-- momento em que o pedido entra em "Novo".
create or replace function public.on_order_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_key text;
  v_new_key text;
begin
  select key into v_old_key from public.order_statuses where id = old.status_id;
  select key into v_new_key from public.order_statuses where id = new.status_id;

  if v_old_key = 'awaiting_payment' and v_new_key <> 'awaiting_payment' then
    insert into public.order_item_stations (order_item_id, station_id, sequence)
    select oi.id, ps.station_id, ps.sequence
    from public.order_items oi
    join public.product_stations ps on ps.product_id = oi.product_id
    where oi.order_id = new.id
      and not exists (
        select 1 from public.order_item_stations existing
        where existing.order_item_id = oi.id and existing.station_id = ps.station_id
      );
  end if;

  return new;
end;
$$;
