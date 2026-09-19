/**
 * Vocabulary for the future role/permission system. No enforcement lives
 * here yet — this only names the shape so features can be written against
 * a stable contract before the real rules and RLS policies exist.
 */
export type Role = "saas_admin" | "owner" | "manager" | "staff";

export interface Permission {
  resource: string;
  action: "create" | "read" | "update" | "delete";
}

export interface Profile {
  userId: string;
  tenantId: string;
  role: Role;
}
