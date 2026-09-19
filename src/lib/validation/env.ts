import { z } from "zod";

/**
 * Validates process.env at startup so a missing/misnamed variable fails
 * loudly instead of surfacing as a confusing runtime error deep in Supabase.
 */
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Server-only. Never reference this constant from a "use client" module.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables:\n${JSON.stringify(z.treeifyError(parsed.error), null, 2)}`,
    );
  }

  return parsed.data;
}
