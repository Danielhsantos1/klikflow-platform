import "server-only";
import { neon } from "@neondatabase/serverless";

/**
 * Privileged direct Postgres connection using the full connection string
 * (DATABASE_URL, owner role). `server-only` guarantees a build error if
 * this module is ever imported from client code. This role has
 * `BYPASSRLS` — Neon does not allow removing that attribute from
 * API-created roles — so every query here skips Row Level Security
 * entirely. Restrict usage to trusted server-side operations (running
 * migrations, admin jobs, writing audit_log), never to handle end-user
 * requests directly. User-facing reads/writes must go through
 * `src/lib/db/client.ts` (the Data API), which enforces RLS.
 */
export const sql = neon(process.env.DATABASE_URL!);
