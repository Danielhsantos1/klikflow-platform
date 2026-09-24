"use client";

import { useEffect, useState } from "react";

import { anonRpc, anonSelect } from "@/lib/db/anonymous";
import { Button } from "@/components/ui/button";
import { CategoryPills } from "@/components/pos/category-pills";
import { ProductCard } from "@/components/pos/product-card";
import { CartPanel, type CartLine } from "@/components/pos/cart-panel";
import type { Category, ConsumptionLocation, Product } from "@/types/catalog";
import type { Tab } from "@/types/order";
import type { Order, OrderItem } from "@/types/order";

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
 * Every request here goes through `anonSelect`/`anonRpc`
 * (`src/lib/db/anonymous.ts`) — plain `fetch()`, no Authorization
 * header — never `createDbClient()`, which always attaches whatever
 * staff session cookie the browser happens to have.
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
  const [finished, setFinished] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

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
          setError(openError ?? "Não foi possível iniciar seu pedido.");
          setLoading(false);
          return;
        }

        currentTab = data;
        window.localStorage.setItem(tokenStorageKey(locationId), data.access_token!);
      }

      if (cancelled) return;
      setTab(currentTab);

      const [categoriesRes, productsRes] = await Promise.all([
        anonSelect<Category>(
          "categories",
          `tenant_id=eq.${currentTab.tenant_id}&select=*&order=name.asc`,
        ),
        anonSelect<Product>(
          "products",
          `tenant_id=eq.${currentTab.tenant_id}&select=*&order=name.asc`,
        ),
      ]);

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

  if (loading) {
    return <p className="p-6 text-center text-muted">Carregando...</p>;
  }

  if (error && !tab) {
    return <p className="p-6 text-center text-sm text-danger">{error}</p>;
  }

  if (!startedOrdering) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="text-2xl">Olá! 👋</p>
        <p className="text-lg text-muted">Como você deseja fazer seu pedido?</p>
        <Button size="lg" onClick={() => setStartedOrdering(true)}>
          Fazer meu pedido
        </Button>
      </main>
    );
  }

  if (finished) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-2xl">Pedido enviado! ✅</p>
        <p className="text-lg text-muted">Dirija-se ao balcão para pagar e retirar seu pedido.</p>
      </main>
    );
  }

  const visibleProducts = activeCategoryId
    ? products.filter((product) => product.category_id === activeCategoryId)
    : products;

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
    <main className="flex flex-1 flex-col lg:flex-row">
      <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        <h1 className="text-xl font-semibold">{location?.label}</h1>
        {error && <p className="text-sm text-danger">{error}</p>}

        <CategoryPills
          categories={categories}
          activeId={activeCategoryId}
          onSelect={setActiveCategoryId}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visibleProducts.map((product) => (
            <ProductCard
              key={product.id}
              name={product.name}
              price={Number(product.price)}
              onAdd={() => handleAddToCart(product)}
            />
          ))}
          {visibleProducts.length === 0 && (
            <p className="col-span-full text-sm text-muted">Nenhum produto nesta categoria.</p>
          )}
        </div>
      </div>

      <aside className="border-t border-border bg-surface px-4 py-4 sm:px-6 lg:sticky lg:top-0 lg:h-screen lg:w-80 lg:shrink-0 lg:border-t-0 lg:border-l">
        <CartPanel
          title="Seu pedido"
          lines={cartLines}
          actionLabel="Finalizar pedido"
          onAction={() => setFinished(true)}
          emptyLabel="Adicione itens do cardápio."
        />
      </aside>
    </main>
  );
}
