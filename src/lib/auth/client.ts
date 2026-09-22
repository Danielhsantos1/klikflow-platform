"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/**
 * Client-side Neon Auth instance. Talks to the same-origin proxy at
 * `src/app/api/auth/[...path]/route.ts`, so no auth URL is configured
 * here. Used by the login/signup forms and by `authClient.useSession()`
 * wherever a Client Component needs to react to session changes.
 */
export const authClient = createAuthClient();
