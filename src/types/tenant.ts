/**
 * Domain-level shape of the future multi-tenancy hierarchy.
 * No table exists yet — these types only fix the vocabulary the rest of the
 * codebase should use (see /docs/architecture.md) so features written before
 * the schema lands still speak the same language.
 */
export interface Tenant {
  id: string;
  name: string;
  segment: BusinessSegment;
}

export type BusinessSegment =
  | "cafeteria"
  | "restaurant"
  | "bar"
  | "hotel"
  | "clinic"
  | "convenience"
  | "other";

export interface Unit {
  id: string;
  tenantId: string;
  name: string;
}

export interface ConsumptionLocation {
  id: string;
  unitId: string;
  label: string;
}
