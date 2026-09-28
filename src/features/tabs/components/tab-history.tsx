"use client";

import { useEffect, useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrderItem, Tab } from "@/types/order";

type ClosedTab = Tab & {
  consumption_locations: { label: string } | null;
  orders: { id: string; customer_name: string | null; order_items: OrderItem[] }[];
};

type Period = "today" | "week" | "month";

const PERIOD_LABEL: Record<Period, string> = {
  today: "Dia",
  week: "Semana",
  month: "Mês",
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

function tabCustomerName(tab: ClosedTab) {
  return tab.orders.find((order) => order.customer_name)?.customer_name ?? null;
}

function periodStart(period: Period) {
  const now = new Date();

  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function TabHistory({ tenantId }: { tenantId: string }) {
  const [tabs, setTabs] = useState<ClosedTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTabId, setExpandedTabId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("today");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const db = createDbClient();
      const { data, error: fetchError } = await db
        .from("tabs")
        .select("*, consumption_locations(label), orders(id, customer_name, order_items(*))")
        .eq("tenant_id", tenantId)
        .eq("status", "closed")
        .gte("closed_at", periodStart(period).toISOString())
        .order("closed_at", { ascending: false })
        .limit(100);

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
  }, [tenantId, period]);

  const periodTotal = tabs.reduce((sum, tab) => sum + tabTotal(tab), 0);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Histórico</h1>
        <p className="text-sm text-muted">
          Comandas já fechadas — clique numa linha pra ver os itens e o total pago.
        </p>
      </div>

      <div className="flex gap-2">
        {(["today", "week", "month"] as const).map((option) => (
          <Button
            key={option}
            size="sm"
            variant={period === option ? "default" : "outline"}
            onClick={() => setPeriod(option)}
          >
            {PERIOD_LABEL[option]}
          </Button>
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Carregando histórico...</p>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm font-semibold">
            <span>
              Total no período ({tabs.length} {tabs.length === 1 ? "comanda" : "comandas"})
            </span>
            <span>{formatBRL(periodTotal)}</span>
          </div>

          <ul className="flex flex-col gap-2">
            {tabs.map((tab) => {
              const isExpanded = expandedTabId === tab.id;
              const items = tab.orders.flatMap((order) => order.order_items);
              const customerName = tabCustomerName(tab);

              return (
                <li key={tab.id} className="rounded-md border border-border">
                  <button
                    onClick={() => setExpandedTabId(isExpanded ? null : tab.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {tab.consumption_locations?.label ?? "Local removido"}
                        {customerName && (
                          <span className="text-muted"> — {customerName}</span>
                        )}
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
                          <span>{formatBRL(Number(item.unit_price) * item.quantity)}</span>
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
              <li className="text-sm text-muted">Nenhuma comanda fechada nesse período.</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
