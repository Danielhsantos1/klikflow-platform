import { defaultDeriveNeonUrls } from "@neondatabase/neon-js";

const { dataApi: DATA_API_URL } = defaultDeriveNeonUrls(
  process.env.NEXT_PUBLIC_NEON_DATABASE_URL!,
);

/**
 * Plain `fetch()` against the Neon Data API, no Authorization header at
 * all — for the customer-facing channels (QR Code / Totem), where
 * there is no session to resolve a token from.
 *
 * `createClient()`'s "external auth provider" form (used by
 * `createDbClient()`) throws `AuthRequiredError` the moment `getToken`
 * resolves to `null`, instead of just sending the request without a
 * bearer token — there is no supported way to make it treat "no
 * session" as "request as the Data API's `anonymous` role" (see
 * `db_anon_role` in the Data API config, and the `GRANT`s/policies in
 * `db/migrations/0014_public_menu_read.sql`). Bypassing the SDK here
 * with a bare `fetch()` is exactly the mechanism this project's own
 * `scripts/test-*.browser.js` have used since Task 02 — already proven
 * against the real Neon Data API.
 */
function first<T>(body: unknown): T | null {
  return (Array.isArray(body) ? body[0] : body) ?? null;
}

export async function anonSelect<T>(
  table: string,
  query: string,
): Promise<{ data: T[]; error: string | null }> {
  const response = await fetch(`${DATA_API_URL}/${table}?${query}`);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return { data: [], error: (body as { message?: string })?.message ?? `HTTP ${response.status}` };
  }

  return { data: (Array.isArray(body) ? body : []) as T[], error: null };
}

export async function anonRpc<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  const response = await fetch(`${DATA_API_URL}/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return { data: null, error: (body as { message?: string })?.message ?? `HTTP ${response.status}` };
  }

  return { data: first<T>(body), error: null };
}
