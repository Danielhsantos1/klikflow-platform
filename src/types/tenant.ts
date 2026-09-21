import type { Database, TenantSegment } from "@/types/database";

/**
 * Re-exports of the real `tenants`/`units`/`memberships` rows (see
 * `db/migrations/0004_core_multitenancy.sql` and
 * `0006_permissions_roles.sql`), under the domain names the product
 * uses. `ConsumptionLocation` has no table yet — it is Task 04 scope —
 * and stays here only to fix the vocabulary.
 */
export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type Unit = Database["public"]["Tables"]["units"]["Row"];
export type Membership = Database["public"]["Tables"]["memberships"]["Row"];

export type { TenantSegment };

export interface ConsumptionLocation {
  id: string;
  unitId: string;
  label: string;
}
