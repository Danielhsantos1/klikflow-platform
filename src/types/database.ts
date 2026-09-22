/**
 * Hand-written to mirror `db/migrations/*.sql` exactly (the `public`
 * schema, which is what the Neon Data API exposes via `.from()`/`.rpc()`
 * — `neon_auth.*` is Neon Auth's own schema and isn't queried directly by
 * app code). See `docs/data-api/generate-types` for the official
 * generator once this environment can reach Neon's tooling directly.
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
export type MembershipStatus = "active" | "invited" | "suspended";

/**
 * Fixed catalog seeded in `db/migrations/0006_permissions_roles.sql`.
 * New keys are added by future migrations as new business resources
 * (products, orders, payments...) get their own permissions — this union
 * should be kept in sync with the `permissions` table.
 */
export type PermissionKey =
  | "tenant.manage"
  | "units.manage"
  | "memberships.manage"
  | "roles.manage"
  | "audit_log.read"
  | "catalog.manage"
  | "production_stations.manage"
  | "consumption_locations.manage"
  | "tabs.manage"
  | "orders.manage"
  | "orders.configure_statuses"
  | "production.manage";

export type CatalogStatus = "active" | "archived";
export type TabStatus = "open" | "closed";

/**
 * A pedido's status is no longer a fixed enum (Task 06) — `orders`
 * references `order_statuses.id`, a list configurable per tenant. This
 * union is only the set of `key`s `create_tenant()` seeds by default;
 * any tenant may reconfigure its own flow via `orders.configure_statuses`
 * and end up with different keys.
 */
export type DefaultOrderStatusKey =
  | "new"
  | "accepted"
  | "in_production"
  | "ready"
  | "delivered"
  | "completed"
  | "cancelled";

export type OrderItemStationStatus = "pending" | "in_progress" | "done";

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
          role_id: string;
          status: MembershipStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id: string;
          unit_id?: string | null;
          role_id: string;
          status?: MembershipStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          unit_id?: string | null;
          role_id?: string;
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
          {
            foreignKeyName: "memberships_role_id_fkey";
            columns: ["role_id"];
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      permissions: {
        Row: {
          key: PermissionKey;
          description: string;
        };
        // No Insert/Update/Delete: the catalog only changes via
        // migration, never through client code.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      roles: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          // No is_system here: the only is_system role is the one
          // create_tenant() creates server-side; client code can only
          // ever create ordinary (is_system = false) roles.
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          role_id: string;
          permission_key: PermissionKey;
        };
        Insert: {
          role_id: string;
          permission_key: PermissionKey;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_permission_key_fkey";
            columns: ["permission_key"];
            referencedRelation: "permissions";
            referencedColumns: ["key"];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          status: CatalogStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          status?: CatalogStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          status?: CatalogStatus;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          tenant_id: string;
          category_id: string | null;
          name: string;
          description: string | null;
          price: string;
          image_url: string | null;
          status: CatalogStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          category_id?: string | null;
          name: string;
          description?: string | null;
          price: number | string;
          image_url?: string | null;
          status?: CatalogStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          name?: string;
          description?: string | null;
          price?: number | string;
          image_url?: string | null;
          status?: CatalogStatus;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      production_stations: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          status: CatalogStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          status?: CatalogStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          status?: CatalogStatus;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "production_stations_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      product_stations: {
        Row: {
          product_id: string;
          station_id: string;
          sequence: number;
        };
        Insert: {
          product_id: string;
          station_id: string;
          sequence?: number;
        };
        Update: {
          sequence?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_stations_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_stations_station_id_fkey";
            columns: ["station_id"];
            referencedRelation: "production_stations";
            referencedColumns: ["id"];
          },
        ];
      };
      consumption_locations: {
        Row: {
          id: string;
          unit_id: string;
          label: string;
          status: CatalogStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_id: string;
          label: string;
          status?: CatalogStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          label?: string;
          status?: CatalogStatus;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "consumption_locations_unit_id_fkey";
            columns: ["unit_id"];
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      tabs: {
        Row: {
          id: string;
          tenant_id: string;
          consumption_location_id: string;
          status: TabStatus;
          opened_by: string;
          closed_by: string | null;
          opened_at: string;
          closed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          consumption_location_id: string;
          opened_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: TabStatus;
          closed_by?: string | null;
          closed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tabs_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tabs_consumption_location_id_fkey";
            columns: ["consumption_location_id"];
            referencedRelation: "consumption_locations";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          tenant_id: string;
          tab_id: string;
          status_id: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        // status_id may be omitted: set_default_order_status() fills in
        // the tenant's lowest-`sequence` order_statuses row when absent.
        Insert: {
          id?: string;
          tenant_id: string;
          tab_id: string;
          status_id?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        // A status_id change is only accepted when
        // order_status_transitions has a matching row for this tenant —
        // an update to any other status_id is rejected by the database.
        Update: {
          status_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_tab_id_fkey";
            columns: ["tab_id"];
            referencedRelation: "tabs";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          product_name: string;
          unit_price: string;
          quantity: number;
          notes: string | null;
          created_at: string;
        };
        // No product_name/unit_price here: the snapshot_order_item()
        // trigger always overwrites them from the live product row,
        // ignoring anything the client sends — never trust a
        // client-supplied price.
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          quantity: number;
          notes?: string | null;
          created_at?: string;
        };
        // No Update: an order item is immutable once created.
        Update: never;
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      order_statuses: {
        Row: {
          id: string;
          tenant_id: string;
          key: string;
          label: string;
          sequence: number;
          is_terminal: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          key: string;
          label: string;
          sequence: number;
          is_terminal?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          key?: string;
          label?: string;
          sequence?: number;
          is_terminal?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_statuses_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_status_transitions: {
        Row: {
          id: string;
          tenant_id: string;
          from_status_id: string;
          to_status_id: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          from_status_id: string;
          to_status_id: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "order_status_transitions_from_status_id_fkey";
            columns: ["from_status_id"];
            referencedRelation: "order_statuses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_status_transitions_to_status_id_fkey";
            columns: ["to_status_id"];
            referencedRelation: "order_statuses";
            referencedColumns: ["id"];
          },
        ];
      };
      order_item_stations: {
        Row: {
          id: string;
          order_item_id: string;
          station_id: string;
          sequence: number;
          status: OrderItemStationStatus;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        // No Insert: rows are only created by seed_order_item_stations()
        // when an order_item is inserted, never directly by the client.
        Insert: never;
        Update: {
          status?: OrderItemStationStatus;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_item_stations_order_item_id_fkey";
            columns: ["order_item_id"];
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_item_stations_station_id_fkey";
            columns: ["station_id"];
            referencedRelation: "production_stations";
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
        // No Insert/Update types: writes only happen via the privileged
        // direct connection (src/lib/db/admin.ts) from trusted server
        // code, never through the Data API's authenticated role.
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
      has_permission: {
        Args: { target_tenant_id: string; perm_key: PermissionKey };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
  };
}
