"use client";

import { useEffect, useState } from "react";

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

type PendingOrder = {
  id: string;
  tenant_id: string;
  created_at: string;
  customer_name: string | null;
  order_statuses: { key: string } | null;
  tabs: { consumption_locations: { label: string } | null } | null;
  order_items: { id: string; product_name: string; quantity: number; unit_price: string }[];
};

function orderTotal(order: PendingOrder) {
  return order.order_items.reduce((sum, item) => sum + Number(item.unit_price) * item.quantity, 0);
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function fetchPending() {
  const db = createDbClient();
  const { data, error } = await db
    .from("orders")
    .select(
      "id, tenant_id, created_at, customer_name, order_statuses(key)," +
        " tabs(consumption_locations(label))," +
        " order_items(id, product_name, quantity, unit_price)",
    )
    .order("created_at", { ascending: true });

  if (error) return { error: error.message };

  const orders = ((data as unknown as PendingOrder[]) ?? []).filter(
    (order) => order.order_statuses?.key === "awaiting_payment",
  );

  return { orders };
}

/**
 * Tela de Caixa: cliente faz o pedido pelo QR Code/Totem/Tablet, mas o
 * pagamento de verdade acontece aqui, com o atendente — mesma ação que
 * já existia em Comandas ("Confirmar pagamento"), só que numa tela
 * dedicada pro caixa em vez de misturada com a gestão da mesa.
 *
 * A forma de pagamento (Dinheiro/PIX/Débito/Crédito) é só pra guiar o
 * atendente na hora de cobrar — não existe coluna no banco pra isso
 * ainda, então ela não fica salva pra relatório. Se precisar disso no
 * futuro, dá pra adicionar uma coluna em `orders` depois.
 */
export function CashierBoard() {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const result = await fetchPending();
    if (result.error) setError(result.error);
    else setOrders(result.orders ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const result = await fetchPending();
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setOrders(result.orders ?? []);
      setLoading(false);
    }

    poll();
    const interval = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const selected = orders.find((order) => order.id === selectedId) ?? orders[0] ?? null;

  async function handleReceivePayment() {
    if (!selected) return;
    setError(null);
    setConfirming(true);

    const db = createDbClient();
    const { data: newStatus, error: statusError } = await db
      .from("order_statuses")
      .select("id")
      .eq("tenant_id", selected.tenant_id)
      .eq("key", "new")
      .maybeSingle();

    if (statusError || !newStatus) {
      setError(statusError?.message ?? "Status 'Novo' não configurado para esta empresa.");
      setConfirming(false);
      return;
    }

    const { error: updateError } = await db
      .from("orders")
      .update({ status_id: newStatus.id })
      .eq("id", selected.id);

    setConfirming(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMethod(null);
    setSelectedId(null);
    await reload();
  }

  if (loading) {
    return <p className="text-muted">Carregando caixa...</p>;
  }

  return (
    <div className="flex w-full flex-col gap-5 px-6 py-10 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Caixa</h1>
          <span className="text-sm text-muted">{orders.length} aguardando pagamento</span>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}

        {orders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
            Nenhum pedido aguardando pagamento.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {orders.map((order) => {
              const isSelected = order.id === selected?.id;
              const location = order.tabs?.consumption_locations?.label;

              return (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(order.id);
                      setMethod(null);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                      isSelected ? "border-brand bg-brand-soft" : "border-border bg-surface"
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{order.customer_name ?? location ?? "Pedido"}</p>
                      {location && order.customer_name && (
                        <p className="text-xs text-muted">{location}</p>
                      )}
                    </div>
                    <span className="font-bold">{formatBRL(orderTotal(order))}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected && (
        <div className="flex w-full flex-col gap-4 rounded-xl border border-border bg-surface p-5 lg:w-96">
          <h2 className="text-lg font-bold">{selected.customer_name ?? "Pedido"}</h2>

          <ul className="flex flex-col gap-2 border-t border-border pt-3">
            {selected.order_items.map((item) => (
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
            <span>{formatBRL(orderTotal(selected))}</span>
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

          <Button size="lg" disabled={!method || confirming} onClick={handleReceivePayment}>
            {confirming ? "Confirmando..." : "Receber pagamento"}
          </Button>
        </div>
      )}
    </div>
  );
}
