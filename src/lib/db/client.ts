import { createClient } from "@neondatabase/neon-js";
import type { Database } from "@/types/database";

/**
 * Neon Data API + Managed Better Auth client for use in Client
 * Components. Auth and Data API URLs are both derived from
 * NEXT_PUBLIC_NEON_DATABASE_URL — never point this at a connection
 * string with credentials, only the plain HTTPS database URL.
 *
 * Every query made through this client carries the signed-in user's JWT
 * automatically; Postgres RLS (see db/migrations/) decides what comes
 * back — this client itself has no privilege of its own.
 */
export function createDbClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_NEON_DATABASE_URL!);
}
