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

/**
 * Como o pedido chegou define onde o cliente vai buscá-lo — nunca mais
 * "NA MESA" genérico. `staff`/`totem` são retirada no balcão (totem é
 * autoatendimento, não tem garçom pra levar); `qr_code`/`tablet_mesa`
 * são uma mesa de verdade, a equipe entrega lá.
 */
/**
 * `list_ready_orders` já limita a 10 pedidos (0028), mas mesmo assim 10
 * cards do tamanho de 2 não cabem numa TV sem rolar — rolagem numa tela
 * passiva de retirada esconde senha de quem chegou primeiro. Em vez de
 * crescer pra baixo, o quadro fica mais denso: menos pedidos, cards
 * gigantes; mais pedidos, mais colunas e letra um pouco menor — sempre
 * uma tela só, sem scroll.
 */
type Density = "spacious" | "comfortable" | "dense";

function densityOf(count: number): Density {
  if (count <= 3) return "spacious";
  if (count <= 6) return "comfortable";
  return "dense";
}

const GRID_DENSITY: Record<
  Density,
  { grid: string; pad: string; number: string; name: string; badge: string }
> = {
  spacious: {
    grid: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
    pad: "px-6 py-8",
    number: "text-7xl sm:text-8xl",
    name: "text-2xl sm:text-3xl",
    badge: "text-sm sm:text-base",
  },
  comfortable: {
    grid: "grid-cols-2 sm:grid-cols-3",
    pad: "px-5 py-6",
    number: "text-6xl sm:text-7xl",
    name: "text-xl sm:text-2xl",
    badge: "text-xs sm:text-sm",
  },
  dense: {
    grid: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5",
    pad: "px-3 py-4",
    number: "text-4xl sm:text-5xl",
    name: "text-base sm:text-lg",
    badge: "text-xs",
  },
};

const PICKUP_INSTRUCTION: Record<string, string> = {
  totem: "RETIRE NO BALCÃO",
  staff: "RETIRE NO BALCÃO",
  qr_code: "ENTREGAREMOS NA MESA",
  tablet_mesa: "ENTREGAREMOS NA MESA",
};

/**
 * Painel público de chamada (Etapa 4/N do fluxo Totem/Tablet com
 * senha) — pensado pra ficar numa TV/monitor no balcão, sem login,
 * lido a vários metros de distância. É uma experiência deliberadamente
 * diferente da tela operacional de Produção (que pode ter detalhe) e
 * da tela do cliente no celular: aqui só o essencial pra alguém
 * reconhecer o próprio pedido rápido — número (dominante), nome,
 * status e onde retirar. Nunca item, preço ou qualquer dado interno.
 *
 * Lê só o necessário via `list_ready_orders()` (SECURITY DEFINER,
 * 0021/0024/0028), nunca o pedido inteiro — mesmo padrão de leitura
 * pública já usado no cardápio (0014).
 *
 * Um pedido que acabou de virar "Pronto" pisca por `NEWLY_READY_MS`
 * pra chamar atenção, depois se acomoda no visual padrão do card —
 * sem isso, um pedido novo se perderia no meio dos que já esperam há
 * mais tempo.
 *
 * Painel 100% informativo (0032): ninguém marca "Entregue" tocando a
 * TV — isso é responsabilidade exclusiva da equipe em Produção. Um
 * pedido só sai daqui quando o status dele muda pra "delivered" (feito
 * em Produção) ou pela rede de segurança de 30min do `list_ready_orders`
 * (0027/0028), que também limita a 10 por vez — o próximo da fila entra
 * sozinho assim que um sai, porque a lista inteira é recalculada a cada
 * poll.
 */
export function ReadyPanel({ tenantId }: { tenantId: string }) {
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [orders, setOrders] = useState<ReadyOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
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

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(clock);
  }, []);

  const size = GRID_DENSITY[densityOf(orders.length)];

  return (
    <main className="flex min-h-screen flex-col gap-10 bg-[#0b0d10] px-6 py-10 text-white sm:px-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-white/50">{tenantName ?? "KlikFlow"}</p>
          <h1 className="text-3xl font-extrabold uppercase tracking-tight sm:text-4xl">
            Pedidos prontos para retirada
          </h1>
          <p className="mt-1 text-base text-white/60">
            Seu pedido aparecerá aqui quando estiver pronto.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-xl tabular-nums text-white/70 sm:text-2xl">
            {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="rounded-full bg-white/10 px-4 py-1 text-sm font-bold uppercase tracking-wide text-white/80">
            Pedidos prontos ({orders.length})
          </span>
        </div>
      </header>

      {error && <p className="text-danger">{error}</p>}

      {orders.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
          <span className="text-6xl">☕</span>
          <p className="text-2xl font-bold">Tudo certo por aqui!</p>
          <p className="text-lg text-white/60">
            Assim que seu pedido estiver pronto ele aparecerá nesta tela.
          </p>
        </div>
      ) : (
        <div className={`grid flex-1 content-start gap-4 ${size.grid}`}>
          {orders.map((order) => {
            const isNew = newlyReadyIds.has(order.order_id);
            const instruction = PICKUP_INSTRUCTION[order.channel] ?? "RETIRE NO BALCÃO";

            return (
              <div
                key={order.order_id}
                className={`flex flex-col items-center gap-2 rounded-3xl border-2 text-center transition-colors ${size.pad} ${
                  isNew
                    ? "animate-pulse border-[#2ecf8b] bg-[#2ecf8b] text-[#07140d]"
                    : "border-white/10 bg-white/[0.06]"
                }`}
              >
                <span className={`font-mono font-black leading-none tabular-nums ${size.number}`}>
                  {order.pickup_number != null ? `#${order.pickup_number.toString().padStart(2, "0")}` : "—"}
                </span>
                <span className={`font-bold uppercase tracking-wide ${size.name}`}>
                  {order.customer_name ?? order.location_label}
                </span>
                <span
                  className={`flex items-center gap-2 rounded-full px-4 py-1.5 font-extrabold uppercase tracking-wide ${size.badge} ${
                    isNew ? "bg-[#07140d]/15 text-[#07140d]" : "bg-[#16a34a]/20 text-[#4ade80]"
                  }`}
                >
                  ✓ Pronto
                </span>
                <span
                  className={`font-semibold uppercase tracking-wide ${size.badge} ${
                    isNew ? "text-[#07140d]/80" : "text-white/60"
                  }`}
                >
                  {instruction}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
