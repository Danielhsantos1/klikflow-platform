"use client";

import { useEffect, useRef, useState } from "react";

import { anonRpcList, anonSelect } from "@/lib/db/anonymous";
import type { Tenant } from "@/types/tenant";

type ReadyOrder = {
  order_id: string;
  pickup_number: number | null;
  customer_name: string | null;
  location_label: string;
  channel: string;
  ready_since: string;
};

const POLL_MS = 5000;
const NEWLY_READY_MS = 8000;

const CHANNEL_BADGE: Record<string, { label: string; className: string }> = {
  totem: { label: "TOTEM", className: "bg-[#4db6ac]" },
  qr_code: { label: "NA MESA", className: "bg-[#ff9800]" },
  staff: { label: "RETIRADA", className: "bg-[#1a1a1a]" },
};

/**
 * Painel público de chamada (Etapa 4/N do fluxo Totem/Tablet com
 * senha) — pensado pra ficar numa TV do balcão, sem login. Lê só o
 * necessário via `list_ready_orders()` (SECURITY DEFINER, 0021/0024),
 * nunca o pedido inteiro — mesmo padrão de leitura pública já usado no
 * cardápio (0014).
 *
 * Um pedido que acabou de virar "Pronto" pisca em verde por
 * `NEWLY_READY_MS` pra chamar atenção, depois se acomoda no visual
 * padrão da lista — sem isso, um pedido novo se perderia no meio dos
 * que já estão esperando há mais tempo.
 */
export function ReadyPanel({ tenantId }: { tenantId: string }) {
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [orders, setOrders] = useState<ReadyOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newlyReadyIds, setNewlyReadyIds] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    anonSelect<Tenant>("tenants", `id=eq.${tenantId}&select=name&limit=1`).then((result) => {
      if (!cancelled && result.data[0]) setTenantName(result.data[0].name);
    });

    async function poll() {
      const { data, error: fetchError } = await anonRpcList<ReadyOrder>("list_ready_orders", {
        p_tenant_id: tenantId,
      });
      if (cancelled) return;

      if (fetchError) {
        setError(fetchError);
        return;
      }

      const freshIds = data.filter((order) => !knownIds.current.has(order.order_id));
      freshIds.forEach((order) => knownIds.current.add(order.order_id));

      if (freshIds.length > 0) {
        setNewlyReadyIds((current) => {
          const next = new Set(current);
          freshIds.forEach((order) => next.add(order.order_id));
          return next;
        });

        freshIds.forEach((order) => {
          setTimeout(() => {
            setNewlyReadyIds((current) => {
              const next = new Set(current);
              next.delete(order.order_id);
              return next;
            });
          }, NEWLY_READY_MS);
        });
      }

      setOrders(data);
    }

    poll();
    const interval = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tenantId]);

  return (
    <main className="flex min-h-screen flex-col gap-8 bg-foreground px-6 py-10 text-background sm:px-10">
      <header className="flex items-baseline justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest opacity-60">KlikFlow · Retirada</p>
          <h1 className="text-4xl font-extrabold">{tenantName ?? "..."}</h1>
        </div>
        <p className="text-2xl font-mono opacity-70">
          {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </header>

      {error && <p className="text-danger">{error}</p>}

      <section className="flex flex-col gap-4">
        <p className="text-lg font-semibold uppercase tracking-wide text-brand">
          Pedidos prontos para retirada
        </p>
        {orders.length === 0 ? (
          <p className="text-xl opacity-50">Nenhum pedido pronto no momento.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {orders.map((order) => {
              const isNew = newlyReadyIds.has(order.order_id);
              const badge = CHANNEL_BADGE[order.channel] ?? {
                label: order.channel.toUpperCase(),
                className: "bg-[#1a1a1a]",
              };

              return (
                <div
                  key={order.order_id}
                  className={`flex items-center justify-between gap-4 rounded-2xl border-2 border-black/40 px-6 py-6 sm:px-8 ${
                    isNew ? "animate-pulse bg-[#2ecf8b] text-[#0d0d0c]" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`min-w-[80px] text-4xl font-black sm:text-5xl ${
                      isNew ? "text-[#0d0d0c]" : "text-brand"
                    }`}
                  >
                    {order.pickup_number != null ? `#${order.pickup_number}` : "—"}
                  </span>
                  <span className="flex-1 text-xl font-bold uppercase sm:text-3xl">
                    {order.customer_name ?? order.location_label}
                  </span>
                  <span
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white sm:px-4 sm:py-2 sm:text-base ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
