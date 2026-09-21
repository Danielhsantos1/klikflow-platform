import { auth } from "@/lib/auth/server";

/**
 * Catch-all proxy for Neon Auth (Managed Better Auth): sign-in/sign-up,
 * OAuth callbacks, session management, email verification, password
 * reset. Required plumbing for the auth client to work at all — this is
 * infrastructure, not a product screen, so it belongs in this
 * foundational task even though no login UI exists yet.
 */
export const { GET, POST } = auth.handler();
