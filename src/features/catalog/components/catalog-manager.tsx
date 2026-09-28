"use client";

import { useEffect, useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { uploadImage } from "@/lib/uploads/upload-image";
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
  const [productDescription, setProductDescription] = useState("");
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
      description: productDescription || null,
      price,
      category_id: productCategoryId || null,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setProductName("");
    setProductDescription("");
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

  async function handleUploadCategoryIcon(categoryId: string, file: File) {
    setError(null);

    try {
      const url = await uploadImage(file);
      const db = createDbClient();
      const { error: updateError } = await db
        .from("categories")
        .update({ image_url: url })
        .eq("id", categoryId);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      await reload();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Falha no upload.");
    }
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
        <div>
          <h2 className="text-lg font-medium">Categorias</h2>
          <p className="text-sm text-muted">
            Agrupam os produtos no cardápio (ex: Bebidas, Salgados). Crie aqui antes de cadastrar
            produtos, pra já poder escolher a categoria deles.
          </p>
        </div>
        <ul className="flex flex-wrap gap-3">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-neutral-200 p-2 text-sm"
            >
              {category.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- external Blob URL, no next/image domain config needed for a preview
                <img
                  src={category.image_url}
                  alt={category.name}
                  className="h-14 w-14 rounded-md bg-[#f5f5f5] object-contain p-1"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-brand-soft text-lg font-bold text-brand">
                  {category.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span>{category.name}</span>
              <label className="cursor-pointer text-xs text-brand underline underline-offset-2">
                {category.image_url ? "Trocar ícone" : "Adicionar ícone"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleUploadCategoryIcon(category.id, file);
                    event.target.value = "";
                  }}
                />
              </label>
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
        <div>
          <h2 className="text-lg font-medium">Estações de produção</h2>
          <p className="text-sm text-muted">
            Onde um produto é preparado (ex: Cozinha, Balcão de Café). Um produto vinculado a uma
            estação entra na fila da aba Produção depois de pago; um produto sem estação (já
            pronto, como uma lata de refrigerante) vai direto pra entrega, sem passar pela fila.
          </p>
        </div>
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
        <div>
          <h2 className="text-lg font-medium">Produtos</h2>
          <p className="text-sm text-muted">
            O que aparece pra equipe lançar na comanda e pro cliente pedir pelo QR Code/Totem. Se
            o produto precisa ser preparado, vincule a uma estação (abaixo do nome) — senão ele
            vai direto pra entrega sem passar pela Produção.
          </p>
        </div>
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
                {product.description && (
                  <p className="text-xs italic text-muted">{product.description}</p>
                )}
                {linkedStation ? (
                  <span className="text-xs text-neutral-400">
                    Estação: {linkedStation} (precisa de preparo)
                  </span>
                ) : stations.length > 0 ? (
                  <StationLinkForm
                    stations={stations}
                    onLink={(stationId) => handleLinkStation(product.id, stationId)}
                  />
                ) : (
                  <span className="text-xs text-neutral-400">
                    Sem estação — já pronto, vai direto pra entrega.
                  </span>
                )}
              </li>
            );
          })}
          {products.length === 0 && (
            <li className="text-sm text-neutral-400">Nenhum produto ainda.</li>
          )}
        </ul>
        <form onSubmit={handleCreateProduct} className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Nome do produto"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              required
            />
          </div>
          <Input
            placeholder="Descrição (opcional, ex: Grãos 100% arábica, torra média)"
            value={productDescription}
            onChange={(event) => setProductDescription(event.target.value)}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
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
          </div>
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
