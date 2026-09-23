import { createClient, defaultDeriveNeonUrls } from "@neondatabase/neon-js";
import type { Database } from "@/types/database";
import { authClient } from "@/lib/auth/client";

/**
 * `createClient(url)`'s single-argument form builds its own Neon Auth
 * client pointed directly at Neon's auth host — a completely separate
 * session from `authClient` (`src/lib/auth/client.ts`), which goes
 * through our same-origin `/api/auth` proxy so the browser actually has
 * a cookie for it. Using the single-argument form here made every Data
 * API request fail with "Provided authentication token is not a valid
 * JWT encoding", because that second, cookie-less auth client never had
 * a session to mint a JWT from.
 *
 * Fix: use the "external auth provider" form and supply the JWT
 * ourselves via `getToken`, pulled from the one real, already-signed-in
 * `authClient`. `getJWTToken` isn't in this beta SDK's public types but
 * is a real runtime method (`NeonAuthAdapterCore#getJWTToken`) shared by
 * every Better Auth adapter — it reads the JWT already cached on the
 * session by the `set-auth-jwt` response header.
 */
type WithJWTToken = { getJWTToken(allowAnonymous?: boolean): Promise<string | null> };

export function createDbClient() {
  const { dataApi } = defaultDeriveNeonUrls(process.env.NEXT_PUBLIC_NEON_DATABASE_URL!);

  return createClient<Database>({
    dataApi: {
      url: dataApi,
      getToken: () => (authClient as unknown as WithJWTToken).getJWTToken(false),
    },
  });
}
