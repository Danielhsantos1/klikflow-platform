import type { Database, TenantSegment } from "@/types/database";

/**
 * Re-exports of the real `tenants`/`units`/`memberships` rows (see
 * `db/migrations/0004_core_multitenancy.sql` and
 * `0006_permissions_roles.sql`), under the domain names the product
 * uses. `ConsumptionLocation` now lives in `src/types/catalog.ts`
 * (Task 04 — it has its own table, `consumption_locations`).
 */
export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type Unit = Database["public"]["Tables"]["units"]["Row"];
export type Membership = Database["public"]["Tables"]["memberships"]["Row"];

export type { TenantSegment };
