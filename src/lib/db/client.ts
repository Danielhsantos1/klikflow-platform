import { createClient, defaultDeriveNeonUrls } from "@neondatabase/neon-js";
import type { Database } from "@/types/database";

/**
 * `createClient(url)`'s single-argument form builds its own Neon Auth
 * client pointed directly at Neon's auth host — a completely separate
 * session from the one `src/lib/auth/client.ts` uses through our
 * same-origin `/api/auth` proxy, where the browser's cookie actually
 * lives. That made every Data API request fail with "Provided
 * authentication token is not a valid JWT encoding": that second,
 * cookie-less auth client never had a session to mint a JWT from.
 *
 * A first fix tried this beta SDK's internal `getJWTToken()` runtime
 * method, which itself failed with an unrelated `AuthApiError: HTTP 404`
 * — a separate bug in how that beta method re-derives the auth base URL
 * internally. A second attempt read `set-auth-jwt` off our own
 * `/api/auth/get-session` proxy — but our Next.js route handler doesn't
 * forward that response header through, so the token came back empty. A
 * third attempt fetched the real Neon Auth host directly (cross-origin,
 * the way `scripts/test-*.browser.js` do) — but that only works for
 * those scripts because they sign in directly against that host too; our
 * app signs in through the same-origin `/api/auth` proxy, so the session
 * cookie only ever exists on `klikflow.vercel.app`, never on Neon's host.
 *
 * Fix: `src/app/api/session-token/route.ts`, a route of our own that
 * reads the session server-side (the same `auth.getSession()` call
 * `getCurrentUser()` already uses successfully) and hands back its JWT.
 */
async function getJwtFromSession(): Promise<string | null> {
  const response = await fetch("/api/session-token", { credentials: "include" });
  if (!response.ok) return null;
  const { token } = (await response.json()) as { token: string | null };
  return token;
}

export function createDbClient() {
  const { dataApi } = defaultDeriveNeonUrls(process.env.NEXT_PUBLIC_NEON_DATABASE_URL!);

  return createClient<Database>({
    dataApi: {
      url: dataApi,
      getToken: getJwtFromSession,
    },
  });
}

// For public, no-login surfaces (`CustomerOrderPage` — Canais de
// Atendimento), see `src/lib/db/anonymous.ts` instead of this file.
// This SDK's "external auth provider" form throws `AuthRequiredError`
// the instant `getToken` resolves to `null` — there is no supported way
// to make it request as the Data API's `anonymous` role, only ever as
// an authenticated one. `anonymous.ts` bypasses the SDK entirely with a
// bare `fetch()`, the same mechanism `scripts/test-*.browser.js` have
// used since Task 02.
