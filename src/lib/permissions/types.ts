import type { Database } from "@/types/database";

/**
 * Real types from the configurable permission system (Task 03) — see
 * `db/migrations/0006_permissions_roles.sql`. `Role` here means "Perfil"
 * (avoids colliding with `public.profiles`, the user data table).
 */
export type Permission = Database["public"]["Tables"]["permissions"]["Row"];
export type PermissionKey = Permission["key"];
export type Role = Database["public"]["Tables"]["roles"]["Row"];
export type RolePermission =
  Database["public"]["Tables"]["role_permissions"]["Row"];

/**
 * `saas_admin` is a platform-level concept (SaaS Admin experience, out
 * of scope until that task) — it is not a tenant `Role` and has no table
 * yet. Kept here only to reserve the vocabulary.
 */
export type PlatformRole = "saas_admin";
