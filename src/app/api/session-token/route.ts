import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

/**
 * Hands the browser the Postgres JWT (`pg_session_jwt`) for the current
 * session, so `src/lib/db/client.ts` can attach it as the Data API's
 * Authorization header.
 *
 * `auth.getSession()`'s `session.token` is Better Auth's own opaque
 * session token, not a JWT — sending that to the Data API is exactly
 * what produced "not a valid JWT encoding". The actual JWT comes from
 * Better Auth's JWT plugin endpoint (`/token`), which mints one from the
 * current session; we call it server-side (via the same underlying
 * handler `/api/auth/[...path]` exposes) so it reads the httpOnly cookie
 * directly, no header-forwarding required.
 */
export async function GET(request: Request) {
  try {
    const response = await auth.handler().GET(request, {
      params: Promise.resolve({ path: ["token"] }),
    });
    const body = (await response.json().catch(() => null)) as { token?: string } | null;
    return NextResponse.json({ token: body?.token ?? null });
  } catch {
    return NextResponse.json({ token: null });
  }
}
