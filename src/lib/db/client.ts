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
 * internally. Sidestepping both: fetch the session directly from our own
 * proxy and read the JWT off the `set-auth-jwt` response header, exactly
 * the mechanism `scripts/test-*.browser.js` have relied on since Task 02
 * and that's been proven to work end-to-end against the real Neon Auth.
 */
async function getJwtFromSession(): Promise<string | null> {
  const response = await fetch("/api/auth/get-session", { credentials: "include" });
  if (!response.ok) return null;
  return response.headers.get("set-auth-jwt");
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
