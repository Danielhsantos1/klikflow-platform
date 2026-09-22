import type {
  Database,
  DefaultOrderStatusKey,
  OrderItemStationStatus,
  TabStatus,
} from "@/types/database";

/**
 * Re-exports of the real transactional core rows: Local de Consumo →
 * Comanda (Tab) → Pedido (Order) → Itens (OrderItem), plus the
 * configurable status flow and production tracking added in Task 06
 * (see `db/migrations/0008_tabs_orders.sql` and
 * `0009_production_status.sql`).
 *
 * `OrderItem.productName`/`unitPrice` are a snapshot taken at insert
 * time — never re-derive them from the live `Product` row.
 *
 * `Order.statusId` points at a tenant-configurable `OrderStatus`, not a
 * fixed enum — resolve the human-readable state by joining
 * `order_statuses`, never by comparing `statusId` to a hardcoded value.
 */
export type Tab = Database["public"]["Tables"]["tabs"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
export type OrderStatus = Database["public"]["Tables"]["order_statuses"]["Row"];
export type OrderStatusTransition =
  Database["public"]["Tables"]["order_status_transitions"]["Row"];
export type OrderItemStation =
  Database["public"]["Tables"]["order_item_stations"]["Row"];

export type { TabStatus, DefaultOrderStatusKey, OrderItemStationStatus };
