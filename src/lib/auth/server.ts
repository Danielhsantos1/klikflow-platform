import { createNeonAuth } from "@neondatabase/auth/next/server";

/**
 * Server-side Neon Auth (Managed Better Auth) instance. Used by the auth
 * API proxy route, and by any Server Component / Server Action / Route
 * Handler that needs the current session (see `getCurrentUser` below).
 */
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});
