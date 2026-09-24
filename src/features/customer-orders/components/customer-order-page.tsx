"use client";

import { useEffect, useState } from "react";

import { createAnonymousDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import type { Category, ConsumptionLocation, Product } from "@/types/catalog";
import type { Tab } from "@/types/order";

type CustomerChannel = "qr_code" | "totem";

type CartItem = { id: string; name: string; unitPrice: number; quantity: number };

function tokenStorageKey(locationId: string) {
  return `klikflow.customer_tab_token.${locationId}`;
}

/**
 * The customer-facing ordering screen for the "Canais de Atendimento"
 * feature (QR Code / Totem — same component serves both, only the
 * `channel` prop differs). No login: identity is a per-tab
 * `access_token` minted by `open_customer_tab()` and stored in
 * `localStorage` so reloading the page resumes the same cart instead of
 * opening a second tab for the location.
 *
 * There is no payment step yet (a separate, not-yet-designed piece of
 * the platform) — every "Adicionar" writes the item to the real order
 * immediately, the same one the kitchen/production board already reads.
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
      const db = createAnonymousDbClient();

      const locationRes = await db
        .from("consumption_locations")
        .select("*")
        .eq("id", locationId)
        .maybeSingle();

      if (cancelled) return;

      if (locationRes.error || !locationRes.data) {
        setError(
          locationRes.error
            ? `Local não encontrado: ${locationRes.error.message}`
            : "Local não encontrado.",
        );
        setLoading(false);
        return;
      }

      setLocation(locationRes.data);

      const storedToken = window.localStorage.getItem(tokenStorageKey(locationId));
      let currentTab: Tab | null = null;

      if (storedToken) {
        const { data } = await db.rpc("get_customer_tab", { p_token: storedToken });
        currentTab = data ?? null;
      }

      if (!currentTab) {
        const { data, error: openError } = await db.rpc("open_customer_tab", {
          p_location_id: locationId,
          p_channel: channel,
        });

        if (openError || !data) {
          setError(openError?.message ?? "Não foi possível iniciar seu pedido.");
          setLoading(false);
          return;
        }

        currentTab = data;
        window.localStorage.setItem(tokenStorageKey(locationId), data.access_token!);
      }

      if (cancelled) return;
      setTab(currentTab);

      const [categoriesRes, productsRes] = await Promise.all([
        db.from("categories").select("*").eq("tenant_id", currentTab.tenant_id).order("name"),
        db.from("products").select("*").eq("tenant_id", currentTab.tenant_id).order("name"),
      ]);

      if (!cancelled) {
        setCategories(categoriesRes.data ?? []);
        setProducts(productsRes.data ?? []);
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

    const db = createAnonymousDbClient();
    let currentOrderId = orderId;

    if (!currentOrderId) {
      const { data, error: orderError } = await db.rpc("create_customer_order", {
        p_token: tab.access_token,
      });

      if (orderError || !data) {
        setError(orderError?.message ?? "Não foi possível criar o pedido.");
        return;
      }

      currentOrderId = data.id;
      setOrderId(currentOrderId);
    }

    const { data: item, error: itemError } = await db.rpc("add_customer_order_item", {
      p_token: tab.access_token,
      p_order_id: currentOrderId,
      p_product_id: product.id,
      p_quantity: 1,
    });

    if (itemError || !item) {
      setError(itemError?.message ?? "Não foi possível adicionar o item.");
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

  if (loading) {
    return <p className="p-6 text-center text-neutral-500">Carregando...</p>;
  }

  if (error && !tab) {
    return <p className="p-6 text-center text-sm text-red-600">{error}</p>;
  }

  if (!startedOrdering) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="text-2xl">Olá! 👋</p>
        <p className="text-lg text-neutral-500">Como você deseja fazer seu pedido?</p>
        <Button size="lg" onClick={() => setStartedOrdering(true)}>
          Fazer meu pedido
        </Button>
      </main>
    );
  }

  const uncategorized = products.filter((product) => !product.category_id);
  const cartTotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-8">
      <h1 className="text-xl font-semibold">{location?.label}</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {categories.map((category) => {
        const categoryProducts = products.filter(
          (product) => product.category_id === category.id,
        );
        if (categoryProducts.length === 0) return null;

        return (
          <section key={category.id} className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-neutral-500">{category.name}</h2>
            <ul className="flex flex-col gap-2">
              {categoryProducts.map((product) => (
                <li
                  key={product.id}
                  className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-neutral-400">
                      {Number(product.price).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => handleAddToCart(product)}>
                    Adicionar
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {uncategorized.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-neutral-500">Outros</h2>
          <ul className="flex flex-col gap-2">
            {uncategorized.map((product) => (
              <li
                key={product.id}
                className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{product.name}</p>
                  <p className="text-xs text-neutral-400">
                    {Number(product.price).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </p>
                </div>
                <Button size="sm" onClick={() => handleAddToCart(product)}>
                  Adicionar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cart.length > 0 && (
        <div className="bg-background sticky bottom-0 flex flex-col gap-1 border-t border-neutral-200 py-3">
          <p className="text-sm font-medium">
            Seu pedido: {cart.length} {cart.length === 1 ? "item" : "itens"} —{" "}
            {cartTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
          <p className="text-xs text-neutral-400">
            Dirija-se ao balcão para pagar e confirmar seu pedido.
          </p>
        </div>
      )}
    </main>
  );
}
