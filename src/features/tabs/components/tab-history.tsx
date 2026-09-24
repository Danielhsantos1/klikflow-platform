"use client";

import { useEffect, useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { Badge } from "@/components/ui/badge";
import type { OrderItem, Tab } from "@/types/order";

type ClosedTab = Tab & {
  consumption_locations: { label: string } | null;
  orders: { id: string; order_items: OrderItem[] }[];
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function tabTotal(tab: ClosedTab) {
  return tab.orders.reduce(
    (sum, order) =>
      sum +
      order.order_items.reduce((itemSum, item) => itemSum + Number(item.unit_price) * item.quantity, 0),
    0,
  );
}

export function TabHistory({ tenantId }: { tenantId: string }) {
  const [tabs, setTabs] = useState<ClosedTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTabId, setExpandedTabId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const db = createDbClient();
      const { data, error: fetchError } = await db
        .from("tabs")
        .select("*, consumption_locations(label), orders(id, order_items(*))")
        .eq("tenant_id", tenantId)
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(30);

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setTabs((data as unknown as ClosedTab[]) ?? []);
      }
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (loading) {
    return <p className="text-sm text-muted">Carregando histórico...</p>;
  }

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Histórico</h2>
      <ul className="flex flex-col gap-2">
        {tabs.map((tab) => {
          const isExpanded = expandedTabId === tab.id;
          const items = tab.orders.flatMap((order) => order.order_items);

          return (
            <li key={tab.id} className="rounded-md border border-border">
              <button
                onClick={() => setExpandedTabId(isExpanded ? null : tab.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-left"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {tab.consumption_locations?.label ?? "Local removido"}
                  </span>
                  <span className="text-xs text-muted">
                    {tab.closed_at ? formatDateTime(tab.closed_at) : "—"}
                  </span>
                </div>
                <Badge variant="success">{formatBRL(tabTotal(tab))}</Badge>
              </button>
              {isExpanded && (
                <ul className="flex flex-col gap-1 border-t border-border px-3 py-2">
                  {items.map((item) => (
                    <li key={item.id} className="flex justify-between text-sm">
                      <span>
                        {item.quantity}x {item.product_name}
                      </span>
                      <span>
                        {formatBRL(Number(item.unit_price) * item.quantity)}
                      </span>
                    </li>
                  ))}
                  {items.length === 0 && (
                    <li className="text-sm text-muted">Nenhum item registrado.</li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
        {tabs.length === 0 && (
          <li className="text-sm text-muted">Nenhuma comanda fechada ainda.</li>
        )}
      </ul>
    </section>
  );
}
