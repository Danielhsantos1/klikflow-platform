import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

/**
 * Catch-all proxy for Neon Auth (Managed Better Auth): sign-in/sign-up,
 * OAuth callbacks, session management, email verification, password
 * reset. Required plumbing for the auth client to work at all — this is
 * infrastructure, not a product screen, so it belongs in this
 * foundational task even though no login UI exists yet.
 */
const handler = auth.handler();

/**
 * A malformed/expired session cookie (e.g. left over from a previous
 * deploy's cookie secret) must fail as an ordinary "no session" response,
 * never as an unhandled crash whose raw error text gets rendered as the
 * whole page. Responding with the same 200/`null` shape Better Auth
 * itself uses for "not logged in" (rather than an error status) is what
 * keeps `authClient.useSession()` resolving normally instead of getting
 * stuck pending — a non-2xx/unexpected-shape response here is exactly
 * the kind of thing its internal session store doesn't know how to
 * settle from.
 */
async function withFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (...args: any[]) => Promise<Response>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[],
) {
  try {
    return await run(...args);
  } catch (error) {
    console.error("[auth-proxy] unhandled error, treating as no session:", error);
    return NextResponse.json(null, { status: 200 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GET = (...args: any[]) => withFallback(handler.GET, args);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const POST = (...args: any[]) => withFallback(handler.POST, args);
