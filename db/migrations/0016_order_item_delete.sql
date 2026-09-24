-- Permite remover um item de pedido enquanto o pedido ainda não entrou
-- em produção — corrige um engano de lançamento sem mexer no histórico
-- de pedidos já em preparo/entregues. `order_item_stations` já tem
-- `on delete cascade` (0009), então remover o item também limpa
-- qualquer rastro na fila de produção.

create policy "order_items_delete_admin"
  on public.order_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      join public.order_statuses os on os.id = o.status_id
      where o.id = order_items.order_id
        and public.has_permission(o.tenant_id, 'orders.manage')
        and os.key in ('new', 'awaiting_payment')
    )
  );

grant delete on public.order_items to authenticated;
