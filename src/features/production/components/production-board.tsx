"use client";

import { useEffect, useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";

const POLL_MS = 5000;
const CLOCK_TICK_MS = 15000;
const LATE_AFTER_MIN = 15;

type BoardOrder = {
  id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  pickup_number: number | null;
  order_statuses: { key: string } | null;
  tabs: { consumption_locations: { label: string } | null } | null;
  order_items: {
    id: string;
    product_name: string;
    quantity: number;
    notes: string | null;
    order_item_stations: { id: string; status: "pending" | "in_progress" | "done" }[];
  }[];
};

type Stage = "new" | "in_progress" | "ready";

function orderIdentity(order: BoardOrder) {
  return {
    number: order.pickup_number != null ? `#${order.pickup_number}` : "—",
    location: order.tabs?.consumption_locations?.label ?? null,
  };
}

function stageOf(order: BoardOrder): Stage {
  if (order.order_statuses?.key === "ready") return "ready";

  const stations = order.order_items.flatMap((item) => item.order_item_stations);
  if (stations.length === 0) return "new";
  if (stations.every((s) => s.status === "pending")) return "new";
  return "in_progress";
}

function minutesSince(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

function formatElapsed(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${rest.toString().padStart(2, "0")}`;
}

async function fetchBoard() {
  const db = createDbClient();
  const { data, error } = await db
    .from("orders")
    .select(
      "id, tenant_id, created_at, updated_at, customer_name, pickup_number, order_statuses(key)," +
        " tabs(consumption_locations(label))," +
        " order_items(id, product_name, quantity, notes, order_item_stations(id, status))",
    )
    .order("created_at", { ascending: true });

  if (error) return { error: error.message };

  const orders = ((data as unknown as BoardOrder[]) ?? []).filter(
    (order) => order.order_statuses?.key === "new" || order.order_statuses?.key === "ready",
  );

  return { orders };
}

/**
 * KDS (Kitchen Display System) do balcão/cozinha — pensado pra ficar
 * aberto o turno inteiro numa tela, não pra administrar a comanda
 * (preço/total fica só em Comandas). Cada PEDIDO é um card único — não
 * item por item — passando por 3 colunas:
 *
 *   Novo → Em Produção → Pronto → (Entregue, some do quadro)
 *
 * Um pedido sem nenhum produto vinculado a Estação de Produção não tem
 * "Em Produção" pra passar (não tem o que preparar de verdade) — o card
 * já nasce em Novo com um botão "Marcar como pronto" direto, sem etapa
 * inventada. Quando TEM estação, "Iniciar produção" avança todos os
 * itens pendentes pra `in_progress`; "Marcar como pronto" conclui os
 * que faltam — e esse UPDATE em `order_item_stations` já dispara o
 * trigger existente (0018) que avança o pedido pra "Pronto" sozinho
 * assim que o último item termina.
 */
export function ProductionBoard() {
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function reload() {
    const result = await fetchBoard();
    if (result.error) setError(result.error);
    else setOrders(result.orders ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const result = await fetchBoard();
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

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(clock);
  }, []);

  async function withStatus(key: "ready" | "delivered", orderId: string, tenantId: string) {
    const db = createDbClient();
    const { data: status, error: statusError } = await db
      .from("order_statuses")
      .select("id")
      .eq("key", key)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (statusError || !status) {
      setError(statusError?.message ?? `Status "${key}" não configurado para esta empresa.`);
      return;
    }

    const { error: updateError } = await db
      .from("orders")
      .update({ status_id: status.id })
      .eq("id", orderId);

    if (updateError) setError(updateError.message);
  }

  async function handleStartProduction(order: BoardOrder) {
    setError(null);
    const pendingIds = order.order_items
      .flatMap((item) => item.order_item_stations)
      .filter((s) => s.status === "pending")
      .map((s) => s.id);

    if (pendingIds.length === 0) return;

    const db = createDbClient();
    const { error: updateError } = await db
      .from("order_item_stations")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .in("id", pendingIds);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await reload();
  }

  async function handleMarkReady(order: BoardOrder) {
    setError(null);
    const stations = order.order_items.flatMap((item) => item.order_item_stations);
    const remainingIds = stations.filter((s) => s.status !== "done").map((s) => s.id);

    if (remainingIds.length === 0) {
      // Nada pra concluir (sem estação nenhuma, ou tudo já tinha sido
      // concluído antes) - o trigger de banco só avança sozinho quando
      // um UPDATE em order_item_stations dispara, então aqui precisa
      // mover o pedido pra "Pronto" direto.
      await withStatus("ready", order.id, order.tenant_id);
      await reload();
      return;
    }

    const db = createDbClient();
    const { error: updateError } = await db
      .from("order_item_stations")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .in("id", remainingIds);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await reload();
  }

  async function handleDeliver(order: BoardOrder) {
    setError(null);
    await withStatus("delivered", order.id, order.tenant_id);
    await reload();
  }

  if (loading) {
    return <p className="text-muted">Carregando produção...</p>;
  }

  const columns: { stage: Stage; label: string; hint: string; color: string }[] = [
    { stage: "new", label: "Novos", hint: "Aguardando início", color: "orange" },
    { stage: "in_progress", label: "Em Produção", hint: "Sendo preparado", color: "blue" },
    { stage: "ready", label: "Prontos", hint: "Aguardando entrega", color: "green" },
  ];

  const byStage: Record<Stage, BoardOrder[]> = { new: [], in_progress: [], ready: [] };
  for (const order of orders) {
    byStage[stageOf(order)].push(order);
  }

  return (
    <div className="flex w-full flex-col gap-5 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Produção</h1>
        <span className="font-mono text-lg tabular-nums text-muted">
          {new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {columns.map((column) => (
          <StatChip
            key={column.stage}
            label={column.label}
            count={byStage[column.stage].length}
            color={column.color}
          />
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-4 overflow-x-auto lg:grid-cols-3">
        {columns.map((column) => (
          <section key={column.stage} className="flex min-w-[280px] flex-col gap-3">
            <ColumnHeader label={column.label} hint={column.hint} color={column.color} />
            <div className="flex flex-col gap-3">
              {byStage[column.stage].map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  stage={column.stage}
                  now={now}
                  onStart={() => handleStartProduction(order)}
                  onMarkReady={() => handleMarkReady(order)}
                  onDeliver={() => handleDeliver(order)}
                />
              ))}
              {byStage[column.stage].length === 0 && (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
                  Nenhum pedido aqui.
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

const COLUMN_STYLES: Record<string, { header: string; text: string; dot: string }> = {
  orange: { header: "bg-[#f97316]", text: "text-[#f97316]", dot: "bg-[#f97316]" },
  blue: { header: "bg-[#2563eb]", text: "text-[#2563eb]", dot: "bg-[#2563eb]" },
  green: { header: "bg-[#16a34a]", text: "text-[#16a34a]", dot: "bg-[#16a34a]" },
};

function StatChip({ label, count, color }: { label: string; count: number; color: string }) {
  const style = COLUMN_STYLES[color];
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5">
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      <span className="text-sm font-medium text-muted">{label}</span>
      <span className="text-sm font-bold tabular-nums">{count}</span>
    </div>
  );
}

function ColumnHeader({ label, hint, color }: { label: string; hint: string; color: string }) {
  const style = COLUMN_STYLES[color];
  return (
    <div className={`flex items-center justify-between rounded-lg px-4 py-3 text-white ${style.header}`}>
      <span className="text-base font-bold uppercase tracking-wide">{label}</span>
      <span className="text-xs font-semibold uppercase tracking-wide opacity-90">{hint}</span>
    </div>
  );
}

function OrderCard({
  order,
  stage,
  now,
  onStart,
  onMarkReady,
  onDeliver,
}: {
  order: BoardOrder;
  stage: Stage;
  now: number;
  onStart: () => void;
  onMarkReady: () => void;
  onDeliver: () => void;
}) {
  const { number, location } = orderIdentity(order);
  const elapsedFrom = stage === "ready" ? order.updated_at : order.created_at;
  const minutes = minutesSince(elapsedFrom, now);
  const isLate = minutes >= LATE_AFTER_MIN;
  const hasStations = order.order_items.some((item) => item.order_item_stations.length > 0);
  const notes = order.order_items.filter((item) => item.notes).map((item) => item.notes as string);

  const style = COLUMN_STYLES[stage === "new" ? "orange" : stage === "in_progress" ? "blue" : "green"];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`text-2xl font-black leading-tight ${style.text}`}>{number}</p>
          {order.customer_name && <p className="text-base font-bold leading-tight">{order.customer_name}</p>}
          {location && <p className="text-sm text-muted">{location}</p>}
        </div>
        <span
          className={`shrink-0 font-mono text-sm font-bold tabular-nums ${
            isLate ? "text-danger" : "text-muted"
          }`}
        >
          {formatElapsed(minutes)}
        </span>
      </div>

      <ul className="flex flex-col gap-1 border-t border-border pt-2">
        {order.order_items.map((item) => (
          <li key={item.id} className="text-sm">
            <span className="font-semibold">{item.quantity}x</span> {item.product_name}
          </li>
        ))}
      </ul>

      {notes.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {notes.map((note, index) => (
            <li key={index} className="text-xs font-medium text-warning">
              ⚠️ {note}
            </li>
          ))}
        </ul>
      )}

      {stage === "new" && (
        <Button
          size="lg"
          className="w-full bg-[#f97316] text-white hover:bg-[#ea580c]"
          onClick={hasStations ? onStart : onMarkReady}
        >
          {hasStations ? "Iniciar produção" : "Marcar como pronto"}
        </Button>
      )}
      {stage === "in_progress" && (
        <Button size="lg" className="w-full bg-[#2563eb] text-white hover:bg-[#1d4ed8]" onClick={onMarkReady}>
          Marcar como pronto
        </Button>
      )}
      {stage === "ready" && (
        <Button size="lg" className="w-full bg-[#16a34a] text-white hover:bg-[#15803d]" onClick={onDeliver}>
          Entregue
        </Button>
      )}
    </div>
  );
}
