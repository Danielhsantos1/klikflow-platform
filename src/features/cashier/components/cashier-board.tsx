"use client";

import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth/client";
import { createDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";

const POLL_MS = 5000;

type PaymentMethod = "cash" | "pix" | "debit" | "credit";

const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: "cash", label: "Dinheiro" },
  { key: "pix", label: "PIX" },
  { key: "debit", label: "Débito" },
  { key: "credit", label: "Crédito" },
];

type UnpaidOrder = {
  id: string;
  tab_id: string;
  customer_name: string | null;
  created_at: string;
  order_statuses: { key: string } | null;
  order_items: { id: string; product_name: string; quantity: number; unit_price: string }[];
};

type OpenTab = {
  id: string;
  status: string;
  channel: string;
  consumption_locations: { label: string } | null;
};

type TabWithOrders = {
  tab: OpenTab;
  orders: UnpaidOrder[];
};

function orderTotal(order: UnpaidOrder) {
  return order.order_items.reduce((sum, item) => sum + Number(item.unit_price) * item.quantity, 0);
}

function tabTotal(tab: TabWithOrders) {
  return tab.orders.reduce((sum, order) => sum + orderTotal(order), 0);
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type RawOrder = UnpaidOrder & {
  tabs: OpenTab | null;
};

async function fetchOpenTabs() {
  const db = createDbClient();
  const { data, error } = await db
    .from("orders")
    .select(
      "id, tab_id, customer_name, created_at, order_statuses(key)," +
        " tabs(id, status, channel, consumption_locations(label))," +
        " order_items(id, product_name, quantity, unit_price)",
    )
    .is("paid_at", null)
    .order("created_at", { ascending: true });

  if (error) return { error: error.message };

  const unpaidOrders = ((data as unknown as RawOrder[]) ?? []).filter(
    (order) =>
      order.tabs?.status === "open" &&
      order.tabs?.channel !== "totem" &&
      order.order_statuses?.key !== "cancelled",
  );

  const byTab = new Map<string, TabWithOrders>();
  for (const order of unpaidOrders) {
    if (!order.tabs) continue;
    const existing = byTab.get(order.tab_id);
    if (existing) {
      existing.orders.push(order);
    } else {
      byTab.set(order.tab_id, { tab: order.tabs, orders: [order] });
    }
  }

  return { tabs: Array.from(byTab.values()) };
}

/**
 * Tela de Caixa: fecha a COMANDA inteira, não pedido por pedido.
 *
 * QR Code, Tablet na Mesa e Atendente (Comandas) não pagam a cada
 * pedido - o cliente pode pedir à vontade, tudo já vai pra produção na
 * hora (0035), e só paga tudo junto aqui quando for embora. O Totem
 * não aparece aqui: ele paga sozinho na hora e a Comanda já fecha
 * sozinha (0026).
 *
 * "Fechar comanda" marca todos os pedidos não pagos daquela mesa com a
 * mesma forma de pagamento e fecha a Comanda de uma vez.
 */
export function CashierBoard() {
  const session = authClient.useSession();
  const userId = session.data?.user?.id;

  const [tabs, setTabs] = useState<TabWithOrders[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const result = await fetchOpenTabs();
    if (result.error) setError(result.error);
    else setTabs(result.tabs ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const result = await fetchOpenTabs();
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setTabs(result.tabs ?? []);
      setLoading(false);
    }

    poll();
    const interval = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const selected = tabs.find((entry) => entry.tab.id === selectedTabId) ?? tabs[0] ?? null;

  async function handleCloseTab() {
    if (!selected || !method || !userId) return;
    setError(null);
    setConfirming(true);

    const db = createDbClient();
    const orderIds = selected.orders.map((order) => order.id);

    const { error: payError } = await db
      .from("orders")
      .update({ paid_at: new Date().toISOString(), payment_method: method })
      .in("id", orderIds);

    if (payError) {
      setConfirming(false);
      setError(payError.message);
      return;
    }

    const { error: closeError } = await db
      .from("tabs")
      .update({ status: "closed", closed_by: userId, closed_at: new Date().toISOString() })
      .eq("id", selected.tab.id);

    setConfirming(false);

    if (closeError) {
      setError(closeError.message);
      return;
    }

    setMethod(null);
    setSelectedTabId(null);
    await reload();
  }

  if (loading) {
    return <p className="text-muted">Carregando caixa...</p>;
  }

  const items = selected ? selected.orders.flatMap((order) => order.order_items) : [];

  return (
    <div className="flex w-full flex-col gap-5 px-6 py-10 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Caixa</h1>
          <span className="text-sm text-muted">{tabs.length} comandas com saldo</span>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}

        {tabs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
            Nenhuma comanda com saldo pendente.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tabs.map((entry) => {
              const isSelected = entry.tab.id === selected?.tab.id;
              const location = entry.tab.consumption_locations?.label;
              const customerNames = Array.from(
                new Set(entry.orders.map((order) => order.customer_name).filter(Boolean)),
              ) as string[];

              return (
                <li key={entry.tab.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTabId(entry.tab.id);
                      setMethod(null);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                      isSelected ? "border-brand bg-brand-soft" : "border-border bg-surface"
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{location ?? "Comanda"}</p>
                      {customerNames.length > 0 && (
                        <p className="text-xs text-muted">{customerNames.join(", ")}</p>
                      )}
                    </div>
                    <span className="font-bold">{formatBRL(tabTotal(entry))}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected && (
        <div className="flex w-full flex-col gap-4 rounded-xl border border-border bg-surface p-5 lg:w-96">
          <h2 className="text-lg font-bold">
            {selected.tab.consumption_locations?.label ?? "Comanda"}
          </h2>

          <ul className="flex flex-col gap-2 border-t border-border pt-3">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between text-sm">
                <span>
                  {item.quantity}x {item.product_name}
                </span>
                <span>{formatBRL(Number(item.unit_price) * item.quantity)}</span>
              </li>
            ))}
          </ul>

          <div className="flex justify-between border-t border-border pt-3 text-lg font-bold">
            <span>Total</span>
            <span>{formatBRL(tabTotal(selected))}</span>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted">Forma de pagamento</p>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setMethod(option.key)}
                  className={`rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${
                    method === option.key ? "border-brand bg-brand-soft" : "border-border"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <Button size="lg" disabled={!method || confirming} onClick={handleCloseTab}>
            {confirming ? "Fechando..." : "Fechar comanda"}
          </Button>
        </div>
      )}
    </div>
  );
}
