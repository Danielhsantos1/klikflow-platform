"use client";

import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth/client";
import { createDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabPanel } from "@/features/tabs/components/tab-panel";
import type { ConsumptionLocation, Product } from "@/types/catalog";
import type { Tab } from "@/types/order";

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

  const [locationsRes, tabsRes, productsRes] = await Promise.all([
    db.from("consumption_locations").select("*").eq("unit_id", unitId).order("label"),
    db.from("tabs").select("*").eq("tenant_id", tenantId).eq("status", "open"),
    db.from("products").select("*").eq("tenant_id", tenantId).eq("status", "active").order("name"),
  ]);

  if (locationsRes.error) return { error: locationsRes.error.message };
  if (productsRes.error) return { error: productsRes.error.message };

  const openTabs = tabsRes.data ?? [];
  const locations: LocationWithTab[] = (locationsRes.data ?? []).map((location) => ({
    ...location,
    openTab: openTabs.find((tab) => tab.consumption_location_id === location.id) ?? null,
  }));

  return { unitId, locations, products: productsRes.data ?? [] };
}

export function OperationsBoard({ tenantId }: { tenantId: string }) {
  const session = authClient.useSession();
  const userId = session.data?.user?.id;

  const [unitId, setUnitId] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationWithTab[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newLocationLabel, setNewLocationLabel] = useState("");
  const [expandedLocationId, setExpandedLocationId] = useState<string | null>(null);

  async function reload() {
    const result = await fetchBoard(tenantId);
    if (result.error) {
      setError(result.error);
      return;
    }
    setUnitId(result.unitId ?? null);
    setLocations(result.locations ?? []);
    setProducts(result.products ?? []);
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
        <h2 className="text-lg font-medium">Locais de consumo</h2>
        <ul className="flex flex-col gap-2">
          {locations.map((location) => (
            <li key={location.id} className="rounded-md border border-neutral-200">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-medium">{location.label}</span>
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
              {location.openTab && expandedLocationId === location.id && (
                <div className="border-t border-neutral-200 px-3 py-3">
                  <TabPanel
                    tab={location.openTab}
                    products={products}
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
