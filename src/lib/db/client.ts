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

/**
 * For public, no-login surfaces (`CustomerOrderPage` — Canais de
 * Atendimento). Never attaches a token, even if the same browser
 * happens to also have a staff session cookie (e.g. a manager opening
 * their own QR code link to demo it) — a customer's request must
 * always hit the Data API as the `anonymous` role, or RLS resolves
 * against whichever staff account is logged in on that device instead
 * of behaving the same for everyone.
 */
export function createAnonymousDbClient() {
  const { dataApi } = defaultDeriveNeonUrls(process.env.NEXT_PUBLIC_NEON_DATABASE_URL!);

  return createClient<Database>({
    dataApi: {
      url: dataApi,
      getToken: async () => null,
    },
  });
}
