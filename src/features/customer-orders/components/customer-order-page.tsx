"use client";

import { useEffect, useState } from "react";
import { Playfair_Display } from "next/font/google";

import { anonRpc, anonSelect } from "@/lib/db/anonymous";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CartPanel, type CartLine } from "@/components/pos/cart-panel";
import { brandStyleVars } from "@/lib/theme/brand-style";
import type { Category, ConsumptionLocation, Product } from "@/types/catalog";
import type { Tab } from "@/types/order";
import type { Order, OrderItem } from "@/types/order";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type CustomerChannel = "qr_code" | "totem";

type CartItem = { id: string; name: string; unitPrice: number; quantity: number };

function tokenStorageKey(locationId: string) {
  return `klikflow.customer_tab_token.${locationId}`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

const ORDER_STATUS_POLL_MS = 5000;

/** Short two-tone beep via Web Audio — no audio file to ship/host. */
function playReadyChime() {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const context = new AudioContextClass();

    [880, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      gain.connect(context.destination);
      const startAt = context.currentTime + index * 0.22;
      gain.gain.setValueAtTime(0.2, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.2);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.2);
    });
  } catch {
    // Best-effort only — some browsers block audio without a prior user
    // gesture. The visual "Pronto!" state still updates regardless.
  }
}

/**
 * The customer-facing ordering screen for the "Canais de Atendimento"
 * feature (QR Code / Totem — same component serves both, only the
 * `channel` prop differs). No login: identity is a per-tab
 * `access_token` minted by `open_customer_tab()` and stored in
 * `localStorage` so reloading the page resumes the same cart instead of
 * opening a second tab for the location.
 *
 * Every request here goes through `anonSelect`/`anonRpc`
 * (`src/lib/db/anonymous.ts`) — plain `fetch()`, no Authorization
 * header — never `createDbClient()`, which always attaches whatever
 * staff session cookie the browser happens to have.
 *
 * "Pagamento aprovado" is simulated (no real gateway yet, decisão da
 * Tarefa 5/N) — `confirm_customer_payment()` just moves the order out of
 * `awaiting_payment`, which is what actually releases it to the
 * kitchen/production board (Etapa 1/N do fluxo Totem/Tablet com senha).
 */
export function CustomerOrderPage({
  locationId,
  channel,
}: {
  locationId: string;
  channel: CustomerChannel;
}) {
  const [location, setLocation] = useState<ConsumptionLocation | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startedOrdering, setStartedOrdering] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [paying, setPaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [pickupNumber, setPickupNumber] = useState<number | null>(null);
  const [orderStatusKey, setOrderStatusKey] = useState<string | null>(null);
  const [brandColor, setBrandColor] = useState<string | null>(null);

  const accessToken = tab?.access_token ?? null;

  useEffect(() => {
    if (!finished || !accessToken || !orderId) return;

    let cancelled = false;
    let previousKey: string | null = null;

    async function poll() {
      const { data } = await anonRpc<{
        status_key: string;
        status_label: string;
        pickup_number: number | null;
      }>("get_customer_order_status", { p_token: accessToken, p_order_id: orderId });

      if (cancelled || !data) return;

      if (previousKey && previousKey !== "ready" && data.status_key === "ready") {
        playReadyChime();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
      previousKey = data.status_key;
      setOrderStatusKey(data.status_key);
    }

    poll();
    const interval = setInterval(poll, ORDER_STATUS_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [finished, accessToken, orderId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await loadImpl();
      } catch (thrown) {
        if (!cancelled) {
          setError(
            thrown instanceof Error
              ? `Erro inesperado: ${thrown.message}`
              : "Erro inesperado ao carregar.",
          );
          setLoading(false);
        }
      }
    }

    async function loadImpl() {
      const locationRes = await anonSelect<ConsumptionLocation>(
        "consumption_locations",
        `id=eq.${locationId}&select=*&limit=1`,
      );

      if (cancelled) return;

      const foundLocation = locationRes.data[0];
      if (locationRes.error || !foundLocation) {
        setError(locationRes.error ?? "Local não encontrado.");
        setLoading(false);
        return;
      }

      setLocation(foundLocation);

      const storedToken = window.localStorage.getItem(tokenStorageKey(locationId));
      let currentTab: Tab | null = null;

      if (storedToken) {
        const { data } = await anonRpc<Tab>("get_customer_tab", { p_token: storedToken });
        currentTab = data;
      }

      if (!currentTab) {
        const { data, error: openError } = await anonRpc<Tab>("open_customer_tab", {
          p_location_id: locationId,
          p_channel: channel,
        });

        if (openError || !data) {
          const friendlyError = openError?.includes("already has an open tab")
            ? "Esta mesa já está em atendimento. Chame um atendente para continuar."
            : (openError ?? "Não foi possível iniciar seu pedido.");
          setError(friendlyError);
          setLoading(false);
          return;
        }

        currentTab = data;
        window.localStorage.setItem(tokenStorageKey(locationId), data.access_token!);
      }

      if (cancelled) return;
      setTab(currentTab);

      const [categoriesRes, productsRes, tenantRes] = await Promise.all([
        anonSelect<Category>(
          "categories",
          `tenant_id=eq.${currentTab.tenant_id}&select=*&order=name.asc`,
        ),
        anonSelect<Product>(
          "products",
          `tenant_id=eq.${currentTab.tenant_id}&select=*&order=name.asc`,
        ),
        anonSelect<{ brand_color: string | null }>(
          "tenants",
          `id=eq.${currentTab.tenant_id}&select=brand_color&limit=1`,
        ),
      ]);

      if (!cancelled) setBrandColor(tenantRes.data[0]?.brand_color ?? null);

      if (!cancelled) {
        setCategories(categoriesRes.data);
        setProducts(productsRes.data);
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [locationId, channel]);

  async function handleAddToCart(product: Product) {
    if (!tab?.access_token) return;
    setError(null);

    let currentOrderId = orderId;

    if (!currentOrderId) {
      const { data, error: orderError } = await anonRpc<Order>("create_customer_order", {
        p_token: tab.access_token,
      });

      if (orderError || !data) {
        setError(orderError ?? "Não foi possível criar o pedido.");
        return;
      }

      currentOrderId = data.id;
      setOrderId(currentOrderId);
    }

    const { data: item, error: itemError } = await anonRpc<OrderItem>("add_customer_order_item", {
      p_token: tab.access_token,
      p_order_id: currentOrderId,
      p_product_id: product.id,
      p_quantity: 1,
    });

    if (itemError || !item) {
      setError(itemError ?? "Não foi possível adicionar o item.");
      return;
    }

    setCart((current) => [
      ...current,
      {
        id: item.id,
        name: item.product_name,
        unitPrice: Number(item.unit_price),
        quantity: item.quantity,
      },
    ]);
  }

  async function handleRemoveFromCart(lineKey: string) {
    if (!tab?.access_token) return;
    setError(null);

    const [name, unitPriceText] = lineKey.split(":");
    const lastMatch = [...cart]
      .reverse()
      .find((item) => item.name === name && String(item.unitPrice) === unitPriceText);

    if (!lastMatch) return;

    const { error: removeError } = await anonRpc<void>("remove_customer_order_item", {
      p_token: tab.access_token,
      p_item_id: lastMatch.id,
    });

    if (removeError) {
      setError(removeError);
      return;
    }

    setCart((current) => {
      const index = current.map((item) => item.id).lastIndexOf(lastMatch.id);
      return current.filter((_, i) => i !== index);
    });
  }

  async function handleConfirmPayment() {
    if (!tab?.access_token || !orderId) return;
    setError(null);
    setPaying(true);

    const { data, error: payError } = await anonRpc<Order>("confirm_customer_payment", {
      p_token: tab.access_token,
      p_order_id: orderId,
      p_customer_name: customerName,
    });

    setPaying(false);

    if (payError || !data) {
      setError(payError ?? "Não foi possível confirmar o pagamento.");
      return;
    }

    setPickupNumber(data.pickup_number);
    setCheckingOut(false);
    setFinished(true);
  }

  if (loading) {
    return <p className="p-6 text-center text-muted">Carregando...</p>;
  }

  if (error && !tab) {
    return <p className="p-6 text-center text-sm text-danger">{error}</p>;
  }

  if (!startedOrdering) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center" style={brandStyleVars(brandColor)}>
        <p className="text-2xl">{greeting()}! 👋</p>
        <p className="text-lg text-muted">Como você deseja fazer seu pedido?</p>
        <Button size="lg" onClick={() => setStartedOrdering(true)}>
          Fazer meu pedido
        </Button>
      </main>
    );
  }

  if (finished) {
    const isReady = orderStatusKey === "ready";

    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center" style={brandStyleVars(brandColor)}>
        <p className="text-2xl">{isReady ? "Pedido pronto! 🎉" : "Pagamento aprovado! ✅"}</p>
        {pickupNumber != null && (
          <p className="text-5xl font-extrabold text-brand">Nº {pickupNumber}</p>
        )}
        <p className="text-lg text-muted">
          {isReady
            ? "Pode retirar no balcão!"
            : "Preparando seu pedido... fique com a tela aberta, vamos te avisar por aqui quando ficar pronto."}
        </p>
      </main>
    );
  }

  if (checkingOut) {
    const checkoutTotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center" style={brandStyleVars(brandColor)}>
        <p className="text-2xl">Quase lá!</p>
        <div className="flex w-full max-w-sm flex-col gap-1.5 text-left">
          <label htmlFor="customer-name" className="text-sm font-medium">
            Qual seu nome?
          </label>
          <Input
            id="customer-name"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Pra te chamar no painel"
            autoFocus
          />
        </div>
        <p className="text-lg font-semibold">
          Total: {checkoutTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          size="lg"
          disabled={!customerName.trim() || paying}
          onClick={handleConfirmPayment}
        >
          {paying ? "Confirmando..." : "Pagamento aprovado (simulado)"}
        </Button>
        <button
          className="text-sm text-muted underline underline-offset-4"
          onClick={() => setCheckingOut(false)}
        >
          Voltar ao cardápio
        </button>
      </main>
    );
  }

  const sections = [
    ...categories.map((category) => ({
      id: category.id,
      name: category.name,
      products: products.filter((product) => product.category_id === category.id),
    })),
    {
      id: "uncategorized",
      name: "Outros",
      products: products.filter((product) => !product.category_id),
    },
  ].filter((section) => section.products.length > 0);

  const cartLines: CartLine[] = Object.values(
    cart.reduce<Record<string, CartLine>>((lines, item) => {
      const key = `${item.name}:${item.unitPrice}`;
      const existing = lines[key];
      lines[key] = existing
        ? { ...existing, quantity: existing.quantity + item.quantity }
        : { key, name: item.name, unitPrice: item.unitPrice, quantity: item.quantity };
      return lines;
    }, {}),
  );

  return (
    <main
      className="flex flex-1 flex-col bg-[#F9F6F0] text-[#1A1A1A] lg:flex-row"
      style={brandStyleVars(brandColor)}
    >
      <div className="flex flex-1 flex-col lg:overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 pb-16 pt-10 md:px-12 md:pt-16">
          <div className="mb-12 flex flex-col items-center gap-3 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-brand"
            >
              <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
              <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
              <line x1="6" x2="6" y1="2" y2="4" />
              <line x1="10" x2="10" y1="2" y2="4" />
              <line x1="14" x2="14" y1="2" y2="4" />
            </svg>
            <h1
              className={`${playfair.className} mx-auto max-w-md border-y border-brand/30 py-3 text-3xl uppercase tracking-[0.25em] text-brand md:text-4xl`}
            >
              {location?.label ?? "Cardápio"}
            </h1>
            <p className="text-xs uppercase tracking-widest text-[#666666]">{greeting()}</p>
          </div>

          {error && <p className="mb-6 text-sm text-danger">{error}</p>}

          <div className="grid grid-cols-1 gap-x-16 gap-y-12 md:grid-cols-2">
            {sections.map((section) => (
              <section key={section.id} className="flex flex-col gap-6">
                <h2 className="border-b border-[#1A1A1A]/10 pb-2 text-center text-xl font-bold uppercase tracking-widest md:text-left">
                  {section.name}
                </h2>
                <div className="flex flex-col gap-6">
                  {section.products.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleAddToCart(product)}
                      className="flex flex-col text-left"
                    >
                      <div className="flex w-full items-end justify-between">
                        <span className="whitespace-nowrap font-sans text-sm font-bold uppercase tracking-wide md:text-base">
                          {product.name}
                        </span>
                        <span className="mx-2 mb-1 min-w-[20px] flex-grow border-b border-dotted border-[#1A1A1A]/30" />
                        <span className="whitespace-nowrap font-sans text-sm font-bold md:text-base">
                          {formatBRL(Number(product.price))}
                        </span>
                        <span className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand text-xs text-brand">
                          +
                        </span>
                      </div>
                      {product.description && (
                        <p className="mt-1 max-w-[90%] font-serif text-xs italic leading-relaxed text-[#666666] md:text-sm">
                          {product.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {sections.length === 0 && (
            <p className="text-sm text-[#666666]">Nenhum produto cadastrado ainda.</p>
          )}

          <footer className="mt-20 border-t border-brand/20 pt-6 text-center text-xs uppercase tracking-widest text-[#666666]">
            KlikFlow
          </footer>
        </div>
      </div>

      <aside className="border-t border-brand/20 bg-[#F9F6F0] px-4 py-4 sm:px-6 lg:sticky lg:top-0 lg:h-screen lg:w-80 lg:shrink-0 lg:border-t-0 lg:border-l">
        <CartPanel
          title="Seu pedido"
          lines={cartLines}
          actionLabel="Finalizar pedido"
          onAction={() => setCheckingOut(true)}
          emptyLabel="Adicione itens do cardápio."
          onRemove={handleRemoveFromCart}
        />
      </aside>
    </main>
  );
}
