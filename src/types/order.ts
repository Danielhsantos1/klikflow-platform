import type { Database, OrderStatus, TabStatus } from "@/types/database";

/**
 * Re-exports of the real transactional core rows (see
 * `db/migrations/0008_tabs_orders.sql`): Local de Consumo → Comanda
 * (Tab) → Pedido (Order) → Itens (OrderItem). `OrderItem.productName`/
 * `unitPrice` are a snapshot taken at insert time — never re-derive them
 * from the live `Product` row.
 */
export type Tab = Database["public"]["Tables"]["tabs"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];

export type { TabStatus, OrderStatus };
