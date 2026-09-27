"use client";

import { useEffect, useState } from "react";

import { anonRpcList, anonSelect } from "@/lib/db/anonymous";
import type { Tenant } from "@/types/tenant";

type ReadyOrder = {
  order_id: string;
  pickup_number: number | null;
  customer_name: string | null;
  location_label: string;
  ready_since: string;
};

const POLL_MS = 5000;

/**
 * Painel público de chamada (Etapa 4/N do fluxo Totem/Tablet com
 * senha) — pensado pra ficar numa TV do balcão, sem login. Lê só o
 * necessário via `list_ready_orders()` (SECURITY DEFINER, 0021), nunca
 * o pedido inteiro — mesmo padrão de leitura pública já usado no
 * cardápio (0014).
 */
export function ReadyPanel({ tenantId }: { tenantId: string }) {
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [orders, setOrders] = useState<ReadyOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      if (fetchError) setError(fetchError);
      else setOrders(data);
    }

    poll();
    const interval = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tenantId]);

  return (
    <main className="flex min-h-screen flex-col gap-8 bg-foreground px-8 py-10 text-background">
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {orders.map((order) => (
              <div
                key={order.order_id}
                className="flex flex-col gap-2 rounded-2xl border border-brand/30 bg-brand-soft/10 p-6 text-center"
              >
                <span className="text-5xl font-black text-brand">
                  {order.pickup_number != null ? `#${order.pickup_number}` : "—"}
                </span>
                <span className="text-lg font-medium">
                  {order.customer_name ?? order.location_label}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
