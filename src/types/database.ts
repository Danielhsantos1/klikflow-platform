/**
 * Hand-written to mirror `supabase/migrations/*.sql` exactly, because this
 * environment has no Docker available to run
 * `npx supabase gen types typescript --db-url ...`.
 *
 * Once the migrations are applied to a real Supabase project, regenerate
 * this file for real and discard the manual version:
 *   npx supabase gen types typescript --project-id <project-id> > src/types/database.ts
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TenantSegment =
  | "cafeteria"
  | "restaurant"
  | "bar"
  | "hotel"
  | "clinic"
  | "convenience"
  | "other";

export type TenantStatus = "active" | "suspended" | "archived";
export type UnitStatus = "active" | "archived";
export type MembershipRole = "owner" | "manager" | "staff";
export type MembershipStatus = "active" | "invited" | "suspended";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenants: {
        Row: {
          id: string;
          name: string;
          segment: TenantSegment;
          status: TenantStatus;
          created_at: string;
          updated_at: string;
        };
        // No Insert type: rows are created exclusively through the
        // `create_tenant` RPC, never via a direct table insert.
        Insert: never;
        Update: {
          name?: string;
          segment?: TenantSegment;
          status?: TenantStatus;
          updated_at?: string;
        };
        Relationships: [];
      };
      units: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          status: UnitStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          status?: UnitStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          status?: UnitStatus;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "units_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          unit_id: string | null;
          role: MembershipRole;
          status: MembershipStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id: string;
          unit_id?: string | null;
          role?: MembershipRole;
          status?: MembershipStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          unit_id?: string | null;
          role?: MembershipRole;
          status?: MembershipStatus;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_unit_id_fkey";
            columns: ["unit_id"];
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          id: string;
          tenant_id: string | null;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          before_data: Json | null;
          after_data: Json | null;
          created_at: string;
        };
        // No Insert/Update types: writes only happen via the service
        // role from trusted server code, never through the anon/
        // authenticated Postgres roles this app's clients use.
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_tenant: {
        Args: { tenant_name: string; tenant_segment?: TenantSegment };
        Returns: Database["public"]["Tables"]["tenants"]["Row"];
      };
      is_tenant_member: {
        Args: { target_tenant_id: string };
        Returns: boolean;
      };
      is_tenant_admin: {
        Args: { target_tenant_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
  };
}
