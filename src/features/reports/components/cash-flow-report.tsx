"use client";

import { useEffect, useMemo, useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";

type PaymentMethod = "cash" | "pix" | "debit" | "credit" | null;

type PaidOrder = {
  id: string;
  paid_at: string;
  payment_method: PaymentMethod;
  order_items: { unit_price: string; quantity: number }[];
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  debit: "Débito",
  credit: "Crédito",
};

function orderTotal(order: PaidOrder) {
  return order.order_items.reduce((sum, item) => sum + Number(item.unit_price) * item.quantity, 0);
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

async function fetchPaidOrders(rangeStart: Date, rangeEnd: Date) {
  const db = createDbClient();
  const { data, error } = await db
    .from("orders")
    .select("id, paid_at, payment_method, order_items(unit_price, quantity)")
    .not("paid_at", "is", null)
    .gte("paid_at", rangeStart.toISOString())
    .lt("paid_at", rangeEnd.toISOString())
    .order("paid_at");

  if (error) return { error: error.message };
  return { orders: (data as unknown as PaidOrder[]) ?? [] };
}

/**
 * Fluxo de caixa - lacuna identificada comparando com concorrentes
 * (Tairo: "fluxo de caixa mensal, anual e fechamento com visão
 * clara"). Não cria tabela nova - soma, por período, os pedidos que já
 * têm `paid_at` preenchido (0035) com a forma de pagamento (0033/0036),
 * dado que já existe desde a reestruturação de pagamento.
 */
export function CashFlowReport() {
  const [mode, setMode] = useState<"month" | "year">("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [orders, setOrders] = useState<PaidOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (mode === "month") {
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
      return { start, end };
    }
    const start = new Date(anchor.getFullYear(), 0, 1);
    const end = new Date(anchor.getFullYear() + 1, 0, 1);
    return { start, end };
  }, [mode, anchor]);

  useEffect(() => {
    let cancelled = false;

    fetchPaidOrders(range.start, range.end).then((result) => {
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setOrders(result.orders ?? []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [range]);

  const total = orders.reduce((sum, order) => sum + orderTotal(order), 0);

  const byMethod = orders.reduce<Record<string, { count: number; total: number }>>((acc, order) => {
    const key = order.payment_method ?? "outro";
    const entry = acc[key] ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += orderTotal(order);
    acc[key] = entry;
    return acc;
  }, {});

  const bySubperiod = useMemo(() => {
    const buckets = new Map<string, number>();

    for (const order of orders) {
      const date = new Date(order.paid_at);
      const key =
        mode === "month"
          ? String(date.getDate()).padStart(2, "0")
          : MONTH_NAMES[date.getMonth()];
      buckets.set(key, (buckets.get(key) ?? 0) + orderTotal(order));
    }

    return Array.from(buckets.entries());
  }, [orders, mode]);

  function shiftAnchor(delta: number) {
    setAnchor((current) =>
      mode === "month"
        ? new Date(current.getFullYear(), current.getMonth() + delta, 1)
        : new Date(current.getFullYear() + delta, current.getMonth(), 1),
    );
  }

  const periodLabel =
    mode === "month"
      ? `${MONTH_NAMES[anchor.getMonth()]} de ${anchor.getFullYear()}`
      : String(anchor.getFullYear());

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fluxo de caixa</h1>
        <p className="text-sm text-muted">
          Soma dos pedidos pagos (Caixa e Totem) — não inclui pedido ainda não pago.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-border p-1">
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-sm ${mode === "month" ? "bg-brand text-white" : ""}`}
            onClick={() => setMode("month")}
          >
            Mensal
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-sm ${mode === "year" ? "bg-brand text-white" : ""}`}
            onClick={() => setMode("year")}
          >
            Anual
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => shiftAnchor(-1)}>
            ←
          </Button>
          <span className="w-36 text-center text-sm font-medium">{periodLabel}</span>
          <Button variant="outline" size="sm" onClick={() => shiftAnchor(1)}>
            →
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-surface p-5">
            <p className="text-sm text-muted">Total recebido no período</p>
            <p className="text-3xl font-bold">{formatBRL(total)}</p>
            <p className="text-xs text-muted">{orders.length} pedido(s) pago(s)</p>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted">Por forma de pagamento</h2>
            <ul className="flex flex-col gap-1.5">
              {Object.entries(byMethod).map(([method, entry]) => (
                <li
                  key={method}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>
                    {PAYMENT_LABELS[method] ?? "Outro"}{" "}
                    <span className="text-muted">({entry.count})</span>
                  </span>
                  <span className="font-medium">{formatBRL(entry.total)}</span>
                </li>
              ))}
              {Object.keys(byMethod).length === 0 && (
                <li className="text-sm text-muted">Nenhum pedido pago nesse período.</li>
              )}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted">
              {mode === "month" ? "Por dia" : "Por mês"}
            </h2>
            <ul className="flex flex-col gap-1">
              {bySubperiod.map(([label, value]) => (
                <li key={label} className="flex items-center justify-between text-sm">
                  <span className="text-muted">{label}</span>
                  <span>{formatBRL(value)}</span>
                </li>
              ))}
              {bySubperiod.length === 0 && (
                <li className="text-sm text-muted">Sem dados nesse período.</li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
