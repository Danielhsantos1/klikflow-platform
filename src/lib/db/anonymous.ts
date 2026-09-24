import { defaultDeriveNeonUrls } from "@neondatabase/neon-js";

const { dataApi: DATA_API_URL } = defaultDeriveNeonUrls(
  process.env.NEXT_PUBLIC_NEON_DATABASE_URL!,
);

/**
 * `fetch()` against the Neon Data API as the `anonymous` role — for the
 * customer-facing channels (QR Code / Totem), where there is no session
 * at all.
 *
 * Neon's Data API rejects every request with no Authorization header
 * ("missing authentication credentials: required authorization bearer
 * token in JWT format", confirmed against the real Data API) — there is
 * no bare "unauthenticated = anonymous" fallback like PostgREST/Supabase
 * have. Anonymous access needs an actual anonymous JWT, minted by
 * Better Auth's `GET /token/anonymous` endpoint (no session required),
 * which already goes through our own `/api/auth/[...path]` proxy.
 * `getAnonymousToken()` fetches and caches one in memory for the tab's
 * lifetime — it's cheap to re-fetch and short-lived by design, no need
 * to persist it anywhere.
 *
 * `createClient()`'s "external auth provider" form (used by
 * `createDbClient()`) was tried first with `getToken` resolving `null`,
 * but that SDK throws `AuthRequiredError` the instant `getToken`
 * resolves `null` instead of sending the request without a bearer
 * token — no supported way to reach `anonymous` through it. Bypassing
 * the SDK here with bare `fetch()` calls is exactly the mechanism this
 * project's own `scripts/test-*.browser.js` have used since Task 02.
 */
let cachedAnonymousToken: { token: string; expiresAt: number } | null = null;

async function getAnonymousToken(): Promise<string> {
  if (cachedAnonymousToken && cachedAnonymousToken.expiresAt > Date.now() + 5000) {
    return cachedAnonymousToken.token;
  }

  const response = await fetch("/api/auth/token/anonymous", { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Could not obtain an anonymous token (HTTP ${response.status})`);
  }

  const body = (await response.json()) as { token: string; expires_at: number };
  cachedAnonymousToken = { token: body.token, expiresAt: body.expires_at * 1000 };
  return body.token;
}

function first<T>(body: unknown): T | null {
  return (Array.isArray(body) ? body[0] : body) ?? null;
}

export async function anonSelect<T>(
  table: string,
  query: string,
): Promise<{ data: T[]; error: string | null }> {
  const token = await getAnonymousToken();
  const response = await fetch(`${DATA_API_URL}/${table}?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
  const token = await getAnonymousToken();
  const response = await fetch(`${DATA_API_URL}/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(args),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return { data: null, error: (body as { message?: string })?.message ?? `HTTP ${response.status}` };
  }

  return { data: first<T>(body), error: null };
}
