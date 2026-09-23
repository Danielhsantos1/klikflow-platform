import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

/**
 * Hands the browser the Postgres JWT (`pg_session_jwt`) for the current
 * session, so `src/lib/db/client.ts` can attach it as the Data API's
 * Authorization header.
 *
 * Reading it server-side (the same `auth.getSession()` call
 * `getCurrentUser()` already uses successfully) sidesteps two dead ends:
 * the beta SDK's `getJWTToken()` runtime method (404s on its own URL
 * re-derivation) and reading `set-auth-jwt` off our `/api/auth/*` proxy
 * response (Next's route handler doesn't forward that header through).
 */
export async function GET() {
  try {
    const { data } = await auth.getSession();
    return NextResponse.json({ token: data?.session?.token ?? null });
  } catch {
    return NextResponse.json({ token: null });
  }
}
