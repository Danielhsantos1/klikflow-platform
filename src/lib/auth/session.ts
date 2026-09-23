import "server-only";
import { auth } from "@/lib/auth/server";

/**
 * Reads the authenticated user for the current request on the server.
 * Returns `null` when there is no session — callers decide whether that
 * means redirect, 401, or a public fallback.
 *
 * Callers in a Server Component must set `export const dynamic =
 * "force-dynamic"` on that route, since the underlying session read
 * depends on cookies.
 */
export async function getCurrentUser() {
  try {
    const { data: session } = await auth.getSession();
    return session?.user ?? null;
  } catch {
    // A malformed/expired session cookie must be treated as "not logged
    // in", never as a crash — the caller redirects to /login either way.
    return null;
  }
}
