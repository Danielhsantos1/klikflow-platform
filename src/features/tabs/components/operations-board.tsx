"use client";

import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth/client";
import { createDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabPanel } from "@/features/tabs/components/tab-panel";
import { Badge } from "@/components/ui/badge";
import type { Category, ConsumptionLocation, Product } from "@/types/catalog";
import type { Tab } from "@/types/order";

const CHANNEL_LABEL: Record<Tab["channel"], string> = {
  staff: "Aberta pela equipe",
  qr_code: "Aberta por cliente (QR Code)",
  tablet_mesa: "Aberta por cliente (Tablet na Mesa)",
  totem: "Aberta por cliente (Totem)",
};

const CHANNEL_SHORT_LABEL: Record<"qr_code" | "tablet_mesa" | "totem", string> = {
  qr_code: "QR Code (cliente escaneia com o próprio celular)",
  tablet_mesa: "Tablet na Mesa (aparelho fixo naquela mesa)",
  totem: "Totem (aparelho compartilhado no balcão)",
};

type LocationWithTab = ConsumptionLocation & { openTab: Tab | null };

async function fetchBoard(tenantId: string) {
  const db = createDbClient();

  const unitRes = await db
    .from("units")
    .select("id")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (unitRes.error || !unitRes.data) {
    return { error: unitRes.error?.message ?? "Nenhuma unidade encontrada para esta empresa." };
  }

  const unitId = unitRes.data.id;

  const [locationsRes, tabsRes, productsRes, categoriesRes] = await Promise.all([
    db.from("consumption_locations").select("*").eq("unit_id", unitId).order("label"),
    db.from("tabs").select("*").eq("tenant_id", tenantId).eq("status", "open"),
    db.from("products").select("*").eq("tenant_id", tenantId).eq("status", "active").order("name"),
    db.from("categories").select("*").eq("tenant_id", tenantId).order("name"),
  ]);

  if (locationsRes.error) return { error: locationsRes.error.message };
  if (productsRes.error) return { error: productsRes.error.message };
  if (categoriesRes.error) return { error: categoriesRes.error.message };

  const openTabs = tabsRes.data ?? [];
  const locations: LocationWithTab[] = (locationsRes.data ?? []).map((location) => ({
    ...location,
    openTab: openTabs.find((tab) => tab.consumption_location_id === location.id) ?? null,
  }));

  return {
    unitId,
    locations,
    products: productsRes.data ?? [],
    categories: categoriesRes.data ?? [],
  };
}

export function OperationsBoard({ tenantId }: { tenantId: string }) {
  const session = authClient.useSession();
  const userId = session.data?.user?.id;

  const [unitId, setUnitId] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationWithTab[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newLocationLabel, setNewLocationLabel] = useState("");
  const [expandedLocationId, setExpandedLocationId] = useState<string | null>(null);
  const [linksLocationId, setLinksLocationId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  function customerLink(locationId: string, channel: "qr_code" | "tablet_mesa" | "totem") {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const suffix = channel === "qr_code" ? "" : `?channel=${channel}`;
    return `${origin}/pedir/${locationId}${suffix}`;
  }

  async function handleCopyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(link);
      setTimeout(() => setCopiedLink((current) => (current === link ? null : current)), 2000);
    } catch {
      // Clipboard API pode falhar sem HTTPS/permissão — o link já fica
      // visível na tela pra copiar manualmente.
    }
  }

  async function reload() {
    const result = await fetchBoard(tenantId);
    if (result.error) {
      setError(result.error);
      return;
    }
    setUnitId(result.unitId ?? null);
    setLocations(result.locations ?? []);
    setProducts(result.products ?? []);
    setCategories(result.categories ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    fetchBoard(tenantId).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
      } else {
        setUnitId(result.unitId ?? null);
        setLocations(result.locations ?? []);
        setProducts(result.products ?? []);
        setCategories(result.categories ?? []);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function handleCreateLocation(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!unitId) return;

    const db = createDbClient();
    const { error: insertError } = await db
      .from("consumption_locations")
      .insert({ unit_id: unitId, label: newLocationLabel });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewLocationLabel("");
    await reload();
  }

  async function handleOpenTab(locationId: string) {
    if (!userId) return;
    setError(null);

    const db = createDbClient();
    const { error: insertError } = await db.from("tabs").insert({
      tenant_id: tenantId,
      consumption_location_id: locationId,
      opened_by: userId,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await reload();
  }

  async function handleCloseTab(tabId: string) {
    if (!userId) return;
    setError(null);

    const db = createDbClient();
    const { error: updateError } = await db
      .from("tabs")
      .update({ status: "closed", closed_by: userId, closed_at: new Date().toISOString() })
      .eq("id", tabId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setExpandedLocationId(null);
    await reload();
  }

  if (loading) {
    return <p className="text-neutral-500">Carregando comandas...</p>;
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium">Locais de consumo</h2>
          <p className="text-sm text-muted">
            Mesas ou balcões da sua loja. “Abrir comanda” começa um atendimento — lançado pela
            equipe direto aqui, ou pelo cliente via “Link do cliente” (QR Code/Totem). Só uma
            comanda aberta por local de cada vez.
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {locations.map((location) => (
            <li key={location.id} className="rounded-md border border-border">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{location.label}</span>
                  {location.openTab && (
                    <Badge variant={location.openTab.channel === "staff" ? "neutral" : "accent"}>
                      {CHANNEL_LABEL[location.openTab.channel]}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setLinksLocationId(linksLocationId === location.id ? null : location.id)
                    }
                  >
                    {linksLocationId === location.id ? "Fechar links" : "Link do cliente"}
                  </Button>
                  {location.openTab ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setExpandedLocationId(
                          expandedLocationId === location.id ? null : location.id,
                        )
                      }
                    >
                      {expandedLocationId === location.id ? "Fechar" : "Ver comanda"}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => handleOpenTab(location.id)}>
                      Abrir comanda
                    </Button>
                  )}
                </div>
              </div>
              {linksLocationId === location.id && (
                <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
                  <p className="text-xs text-muted">
                    Escolha como esse local vai atender: gere um QR Code pra colar na mesa, abra o
                    link do Tablet direto no aparelho fixado nela, ou use o Totem no balcão de
                    autoatendimento. Os três levam ao mesmo cardápio — só muda o aparelho.
                  </p>
                  {(["qr_code", "tablet_mesa", "totem"] as const).map((channel) => {
                    const link = customerLink(location.id, channel);
                    return (
                      <div key={channel} className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted">
                          {CHANNEL_SHORT_LABEL[channel]}
                        </span>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 truncate rounded bg-black/[0.04] px-2 py-1 text-xs dark:bg-white/[0.06]">
                            {link}
                          </code>
                          <Button size="sm" variant="outline" onClick={() => handleCopyLink(link)}>
                            {copiedLink === link ? "Copiado!" : "Copiar"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {location.openTab && expandedLocationId === location.id && (
                <div className="border-t border-border px-3 py-3">
                  <TabPanel
                    tab={location.openTab}
                    products={products}
                    categories={categories}
                    userId={userId ?? ""}
                    onCloseTab={() => handleCloseTab(location.openTab!.id)}
                  />
                </div>
              )}
            </li>
          ))}
          {locations.length === 0 && (
            <li className="text-sm text-neutral-400">Nenhum local de consumo ainda.</li>
          )}
        </ul>
        <form onSubmit={handleCreateLocation} className="flex gap-2">
          <Input
            placeholder="Novo local (ex: Mesa 1)"
            value={newLocationLabel}
            onChange={(event) => setNewLocationLabel(event.target.value)}
            required
          />
          <Button type="submit">Adicionar</Button>
        </form>
      </section>
    </div>
  );
}
