"use client";

import { useEffect, useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { OrderItemStation } from "@/types/order";

type StationItem = OrderItemStation & {
  order_items: {
    product_name: string;
    quantity: number;
    orders: {
      customer_name: string | null;
      pickup_number: number | null;
      tabs: { consumption_locations: { label: string } | null } | null;
    } | null;
  } | null;
  production_stations: { name: string } | null;
};

function orderContextLabel(item: StationItem) {
  const order = item.order_items?.orders;
  if (!order) return null;

  if (order.pickup_number != null) {
    return order.customer_name
      ? `Senha ${order.pickup_number} — ${order.customer_name}`
      : `Senha ${order.pickup_number}`;
  }

  const location = order.tabs?.consumption_locations?.label;
  return location ?? null;
}

async function fetchQueue() {
  const db = createDbClient();
  const { data, error } = await db
    .from("order_item_stations")
    .select(
      "*, order_items(product_name, quantity, orders(customer_name, pickup_number, tabs(consumption_locations(label))))," +
        " production_stations(name)",
    )
    .in("status", ["pending", "in_progress"])
    .order("created_at");

  if (error) return { error: error.message };
  return { items: (data as unknown as StationItem[]) ?? [] };
}

export function ProductionBoard() {
  const [items, setItems] = useState<StationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const result = await fetchQueue();
    if (result.error) setError(result.error);
    else setItems(result.items ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    fetchQueue().then((result) => {
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setItems(result.items ?? []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdvance(item: StationItem) {
    setError(null);

    const db = createDbClient();
    const patch =
      item.status === "pending"
        ? { status: "in_progress" as const, started_at: new Date().toISOString() }
        : { status: "done" as const, completed_at: new Date().toISOString() };

    const { error: updateError } = await db
      .from("order_item_stations")
      .update(patch)
      .eq("id", item.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await reload();
  }

  if (loading) {
    return <p className="text-muted">Carregando produção...</p>;
  }

  const byStation = new Map<string, StationItem[]>();
  for (const item of items) {
    const stationName = item.production_stations?.name ?? "Sem estação";
    byStation.set(stationName, [...(byStation.get(stationName) ?? []), item]);
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      {error && <p className="text-sm text-danger">{error}</p>}

      {[...byStation.entries()].map(([stationName, stationItems]) => (
        <section key={stationName} className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">{stationName}</h2>
          <ul className="flex flex-col gap-2">
            {stationItems.map((item) => {
              const contextLabel = orderContextLabel(item);
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="flex flex-col gap-1">
                    <span>
                      {item.order_items?.quantity}x {item.order_items?.product_name}
                      <span className="ml-2 text-xs text-muted">
                        {item.status === "pending" ? "Pendente" : "Em preparo"}
                      </span>
                    </span>
                    {contextLabel && <Badge variant="accent">{contextLabel}</Badge>}
                  </div>
                  <Button size="sm" onClick={() => handleAdvance(item)}>
                    {item.status === "pending" ? "Iniciar" : "Concluir"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {items.length === 0 && (
        <p className="text-sm text-muted">Nenhum item pendente de produção.</p>
      )}
    </div>
  );
}
