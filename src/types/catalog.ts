import type { CatalogStatus, Database } from "@/types/database";

/**
 * Re-exports of the real catalog rows (see
 * `db/migrations/0007_catalog.sql`), under the domain names the product
 * uses. `price` comes back from the Data API as a string (numeric
 * columns are serialized as strings to avoid float precision loss) —
 * parse with `Number()` only at render time, never store it as a JS
 * number.
 */
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductionStation =
  Database["public"]["Tables"]["production_stations"]["Row"];
export type ProductStation =
  Database["public"]["Tables"]["product_stations"]["Row"];
export type ConsumptionLocation =
  Database["public"]["Tables"]["consumption_locations"]["Row"];

export type { CatalogStatus };
