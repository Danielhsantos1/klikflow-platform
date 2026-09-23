"use client";

import { useEffect, useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import type { OrderItemStation } from "@/types/order";

type StationItem = OrderItemStation & {
  order_items: { product_name: string; quantity: number } | null;
  production_stations: { name: string } | null;
};

async function fetchQueue() {
  const db = createDbClient();
  const { data, error } = await db
    .from("order_item_stations")
    .select("*, order_items(product_name, quantity), production_stations(name)")
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
    return <p className="text-neutral-500">Carregando produção...</p>;
  }

  const byStation = new Map<string, StationItem[]>();
  for (const item of items) {
    const stationName = item.production_stations?.name ?? "Sem estação";
    byStation.set(stationName, [...(byStation.get(stationName) ?? []), item]);
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {[...byStation.entries()].map(([stationName, stationItems]) => (
        <section key={stationName} className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">{stationName}</h2>
          <ul className="flex flex-col gap-2">
            {stationItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-sm"
              >
                <span>
                  {item.order_items?.quantity}x {item.order_items?.product_name}
                  <span className="ml-2 text-xs text-neutral-400">
                    {item.status === "pending" ? "Pendente" : "Em preparo"}
                  </span>
                </span>
                <Button size="sm" onClick={() => handleAdvance(item)}>
                  {item.status === "pending" ? "Iniciar" : "Concluir"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {items.length === 0 && (
        <p className="text-sm text-neutral-400">Nenhum item pendente de produção.</p>
      )}
    </div>
  );
}
