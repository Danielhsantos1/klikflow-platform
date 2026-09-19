import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads the authenticated user for the current request on the server.
 * Returns `null` when there is no session — callers decide whether that
 * means redirect, 401, or a public fallback.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}
