"use client";

import { useEffect, useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryPills } from "@/components/pos/category-pills";
import { ProductCard } from "@/components/pos/product-card";
import type { Category, Product } from "@/types/catalog";
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
  categories,
  userId,
  onCloseTab,
}: {
  tab: Tab;
  products: Product[];
  categories: Category[];
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
    return <p className="text-sm text-muted">Carregando pedidos...</p>;
  }

  const tabTotal = orders
    .filter((order) => order.order_statuses?.key !== "cancelled")
    .reduce(
      (sum, order) =>
        sum + order.items.reduce((itemSum, item) => itemSum + Number(item.unit_price) * item.quantity, 0),
      0,
    );

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-danger">{error}</p>}

      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          products={products}
          categories={categories}
          tenantId={tab.tenant_id}
          onChanged={reload}
        />
      ))}

      {orders.length === 0 && <p className="text-sm text-muted">Nenhum pedido nesta comanda ainda.</p>}

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold">
          Total da comanda:{" "}
          {tabTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </span>
      </div>

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
  categories,
  tenantId,
  onChanged,
}: {
  order: OrderWithItems;
  products: Product[];
  categories: Category[];
  tenantId: string;
  onChanged: () => Promise<void>;
}) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
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

  async function handleAddProduct(product: Product) {
    setError(null);

    const db = createDbClient();
    const { error: insertError } = await db.from("order_items").insert({
      order_id: order.id,
      product_id: product.id,
      quantity: 1,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await onChanged();
  }

  async function handleRemoveItem(itemId: string) {
    setError(null);

    const db = createDbClient();
    const { error: deleteError } = await db.from("order_items").delete().eq("id", itemId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await onChanged();
  }

  const visibleProducts = activeCategoryId
    ? products.filter((product) => product.category_id === activeCategoryId)
    : products;

  const canEditItems =
    order.order_statuses?.key === "new" || order.order_statuses?.key === "awaiting_payment";

  const orderTotal = order.items.reduce(
    (sum, item) => sum + Number(item.unit_price) * item.quantity,
    0,
  );

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Pedido</span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={order.order_statuses?.key === "awaiting_payment" ? "warning" : "neutral"}>
            {order.order_statuses?.label ?? "—"}
          </Badge>
          {order.order_statuses?.key === "awaiting_payment" && (
            <Button size="sm" onClick={handleConfirmPayment}>
              Confirmar pagamento
            </Button>
          )}
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {item.quantity}x {item.product_name}
            </span>
            <span className="flex items-center gap-2">
              {(Number(item.unit_price) * item.quantity).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
              {canEditItems && (
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  className="text-xs text-danger hover:underline"
                  aria-label={`Remover ${item.product_name}`}
                >
                  Remover
                </button>
              )}
            </span>
          </li>
        ))}
        {order.items.length === 0 && <li className="text-sm text-muted">Sem itens ainda.</li>}
      </ul>
      {order.items.length > 0 && (
        <div className="mt-1 flex justify-between border-t border-border pt-1 text-sm font-medium">
          <span>Subtotal</span>
          <span>{orderTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {adding ? (
        <div className="mt-3 flex flex-col gap-2">
          <CategoryPills
            categories={categories}
            activeId={activeCategoryId}
            onSelect={setActiveCategoryId}
          />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                name={product.name}
                price={Number(product.price)}
                onAdd={() => handleAddProduct(product)}
              />
            ))}
            {visibleProducts.length === 0 && (
              <p className="col-span-full text-sm text-muted">Nenhum produto nesta categoria.</p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAdding(false)} className="self-start">
            Concluir
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mt-2" onClick={() => setAdding(true)}>
          Adicionar item
        </Button>
      )}
    </div>
  );
}
