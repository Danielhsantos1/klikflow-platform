"use client";

import { useEffect, useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Category, Product, ProductionStation } from "@/types/catalog";

type ProductWithRelations = Product & {
  categories: { name: string } | null;
  product_stations: { station_id: string; production_stations: { name: string } | null }[];
};

async function fetchCatalog(tenantId: string) {
  const db = createDbClient();
  const [categoriesRes, productsRes, stationsRes] = await Promise.all([
    db.from("categories").select("*").eq("tenant_id", tenantId).order("name"),
    db
      .from("products")
      .select("*, categories(name), product_stations(station_id, production_stations(name))")
      .eq("tenant_id", tenantId)
      .order("name"),
    db.from("production_stations").select("*").eq("tenant_id", tenantId).order("name"),
  ]);

  return { categoriesRes, productsRes, stationsRes };
}

export function CatalogManager({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductWithRelations[]>([]);
  const [stations, setStations] = useState<ProductionStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryName, setCategoryName] = useState("");
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productCategoryId, setProductCategoryId] = useState("");
  const [stationName, setStationName] = useState("");

  async function reload() {
    const { categoriesRes, productsRes, stationsRes } = await fetchCatalog(tenantId);

    if (categoriesRes.error) setError(categoriesRes.error.message);
    else setCategories(categoriesRes.data ?? []);

    if (productsRes.error) setError(productsRes.error.message);
    else setProducts((productsRes.data as unknown as ProductWithRelations[]) ?? []);

    if (stationsRes.error) setError(stationsRes.error.message);
    else setStations(stationsRes.data ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    fetchCatalog(tenantId).then(({ categoriesRes, productsRes, stationsRes }) => {
      if (cancelled) return;

      if (categoriesRes.error) setError(categoriesRes.error.message);
      else setCategories(categoriesRes.data ?? []);

      if (productsRes.error) setError(productsRes.error.message);
      else setProducts((productsRes.data as unknown as ProductWithRelations[]) ?? []);

      if (stationsRes.error) setError(stationsRes.error.message);
      else setStations(stationsRes.data ?? []);

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function handleCreateCategory(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const db = createDbClient();
    const { error: insertError } = await db
      .from("categories")
      .insert({ tenant_id: tenantId, name: categoryName });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setCategoryName("");
    await reload();
  }

  async function handleCreateProduct(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const price = Number(productPrice.replace(",", "."));
    if (!Number.isFinite(price) || price <= 0) {
      setError("Preço inválido.");
      return;
    }

    const db = createDbClient();
    const { error: insertError } = await db.from("products").insert({
      tenant_id: tenantId,
      name: productName,
      price,
      category_id: productCategoryId || null,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setProductName("");
    setProductPrice("");
    setProductCategoryId("");
    await reload();
  }

  async function handleCreateStation(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const db = createDbClient();
    const { error: insertError } = await db
      .from("production_stations")
      .insert({ tenant_id: tenantId, name: stationName });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setStationName("");
    await reload();
  }

  async function handleLinkStation(productId: string, stationId: string) {
    setError(null);

    const db = createDbClient();
    const { error: insertError } = await db
      .from("product_stations")
      .insert({ product_id: productId, station_id: stationId, sequence: 1 });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await reload();
  }

  if (loading) {
    return <p className="text-neutral-500">Carregando cardápio...</p>;
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{tenantName}</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Categorias</h2>
        <ul className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <li
              key={category.id}
              className="rounded-full border border-neutral-200 px-3 py-1 text-sm"
            >
              {category.name}
            </li>
          ))}
          {categories.length === 0 && (
            <li className="text-sm text-neutral-400">Nenhuma categoria ainda.</li>
          )}
        </ul>
        <form onSubmit={handleCreateCategory} className="flex gap-2">
          <Input
            placeholder="Nova categoria"
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
            required
          />
          <Button type="submit">Adicionar</Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Estações de produção</h2>
        <ul className="flex flex-wrap gap-2">
          {stations.map((station) => (
            <li
              key={station.id}
              className="rounded-full border border-neutral-200 px-3 py-1 text-sm"
            >
              {station.name}
            </li>
          ))}
          {stations.length === 0 && (
            <li className="text-sm text-neutral-400">Nenhuma estação ainda.</li>
          )}
        </ul>
        <form onSubmit={handleCreateStation} className="flex gap-2">
          <Input
            placeholder="Nova estação (ex: Cozinha)"
            value={stationName}
            onChange={(event) => setStationName(event.target.value)}
            required
          />
          <Button type="submit">Adicionar</Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Produtos</h2>
        <ul className="flex flex-col gap-2">
          {products.map((product) => {
            const linkedStation = product.product_stations[0]?.production_stations?.name;
            return (
              <li
                key={product.id}
                className="flex flex-col gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span>
                    {product.name}
                    {product.categories?.name && (
                      <span className="text-neutral-400"> — {product.categories.name}</span>
                    )}
                  </span>
                  <span className="font-medium">
                    {Number(product.price).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>
                {linkedStation ? (
                  <span className="text-xs text-neutral-400">
                    Estação: {linkedStation}
                  </span>
                ) : (
                  stations.length > 0 && (
                    <StationLinkForm
                      stations={stations}
                      onLink={(stationId) => handleLinkStation(product.id, stationId)}
                    />
                  )
                )}
              </li>
            );
          })}
          {products.length === 0 && (
            <li className="text-sm text-neutral-400">Nenhum produto ainda.</li>
          )}
        </ul>
        <form
          onSubmit={handleCreateProduct}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <Input
            placeholder="Nome do produto"
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
            required
          />
          <Input
            placeholder="Preço (ex: 25,90)"
            value={productPrice}
            onChange={(event) => setProductPrice(event.target.value)}
            required
          />
          <select
            className="h-10 rounded-md border border-neutral-200 bg-transparent px-3 text-sm"
            value={productCategoryId}
            onChange={(event) => setProductCategoryId(event.target.value)}
          >
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <Button type="submit">Adicionar</Button>
        </form>
      </section>
    </div>
  );
}

function StationLinkForm({
  stations,
  onLink,
}: {
  stations: ProductionStation[];
  onLink: (stationId: string) => void;
}) {
  const [stationId, setStationId] = useState("");

  return (
    <div className="flex gap-2">
      <select
        className="h-8 flex-1 rounded-md border border-neutral-200 bg-transparent px-2 text-xs"
        value={stationId}
        onChange={(event) => setStationId(event.target.value)}
      >
        <option value="">Vincular a uma estação...</option>
        {stations.map((station) => (
          <option key={station.id} value={station.id}>
            {station.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!stationId}
        onClick={() => onLink(stationId)}
      >
        Vincular
      </Button>
    </div>
  );
}
