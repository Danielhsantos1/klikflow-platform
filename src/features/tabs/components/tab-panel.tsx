"use client";

import { useEffect, useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Product } from "@/types/catalog";
import type { Order, OrderItem, Tab } from "@/types/order";

type OrderWithItems = Order & {
  order_statuses: { key: string; label: string } | null;
  items: OrderItem[];
};

async function fetchOrders(tabId: string) {
  const db = createDbClient();
  const { data, error } = await db
    .from("orders")
    .select("*, order_statuses(key, label), order_items(*)")
    .eq("tab_id", tabId)
    .order("created_at");

  if (error) return { error: error.message };

  type RawOrder = Order & {
    order_statuses: { key: string; label: string } | null;
    order_items: OrderItem[];
  };

  const orders = ((data as unknown as RawOrder[]) ?? []).map((order) => ({
    ...order,
    items: order.order_items,
  }));

  return { orders };
}

export function TabPanel({
  tab,
  products,
  userId,
  onCloseTab,
}: {
  tab: Tab;
  products: Product[];
  userId: string;
  onCloseTab: () => void;
}) {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const result = await fetchOrders(tab.id);
    if (result.error) setError(result.error);
    else setOrders(result.orders ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    fetchOrders(tab.id).then((result) => {
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setOrders(result.orders ?? []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [tab.id]);

  async function handleNewOrder() {
    setError(null);
    const db = createDbClient();
    const { error: insertError } = await db.from("orders").insert({
      tenant_id: tab.tenant_id,
      tab_id: tab.id,
      created_by: userId,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await reload();
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">Carregando pedidos...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          products={products}
          tenantId={tab.tenant_id}
          onChanged={reload}
        />
      ))}

      {orders.length === 0 && (
        <p className="text-sm text-neutral-400">Nenhum pedido nesta comanda ainda.</p>
      )}

      <div className="flex justify-between">
        <Button variant="outline" size="sm" onClick={handleNewOrder}>
          Novo pedido
        </Button>
        <Button variant="outline" size="sm" onClick={onCloseTab}>
          Fechar comanda
        </Button>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  products,
  tenantId,
  onChanged,
}: {
  order: OrderWithItems;
  products: Product[];
  tenantId: string;
  onChanged: () => Promise<void>;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);

  async function handleConfirmPayment() {
    setError(null);
    const db = createDbClient();

    const { data: newStatus, error: statusError } = await db
      .from("order_statuses")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("key", "new")
      .maybeSingle();

    if (statusError || !newStatus) {
      setError(statusError?.message ?? "Status 'Novo' não configurado para esta empresa.");
      return;
    }

    const { error: updateError } = await db
      .from("orders")
      .update({ status_id: newStatus.id })
      .eq("id", order.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await onChanged();
  }

  async function handleAddItem(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const qty = Number(quantity);
    if (!productId || !Number.isInteger(qty) || qty <= 0) {
      setError("Selecione um produto e uma quantidade válida.");
      return;
    }

    const db = createDbClient();
    const { error: insertError } = await db.from("order_items").insert({
      order_id: order.id,
      product_id: productId,
      quantity: qty,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setProductId("");
    setQuantity("1");
    await onChanged();
  }

  return (
    <div className="rounded-md border border-neutral-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">Pedido</span>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs">
            {order.order_statuses?.label ?? "—"}
          </span>
          {order.order_statuses?.key === "awaiting_payment" && (
            <Button size="sm" onClick={handleConfirmPayment}>
              Confirmar pagamento
            </Button>
          )}
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between text-sm">
            <span>
              {item.quantity}x {item.product_name}
            </span>
            <span>
              {(Number(item.unit_price) * item.quantity).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </span>
          </li>
        ))}
        {order.items.length === 0 && (
          <li className="text-sm text-neutral-400">Sem itens ainda.</li>
        )}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <form onSubmit={handleAddItem} className="mt-2 flex gap-2">
        <select
          className="h-9 flex-1 rounded-md border border-neutral-200 bg-transparent px-2 text-sm"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
        >
          <option value="">Selecione um produto</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <Input
          type="number"
          min={1}
          className="w-16"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <Button type="submit" size="sm">
          Adicionar
        </Button>
      </form>
    </div>
  );
}
