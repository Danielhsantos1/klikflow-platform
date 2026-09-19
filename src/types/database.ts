/**
 * Placeholder for the generated Supabase database types.
 *
 * Once the schema exists, regenerate this file with:
 *   npx supabase gen types typescript --project-id <project-id> > src/types/database.ts
 *
 * `Database` is kept as an empty-but-valid shape for now so `SupabaseClient<Database>`
 * type-checks before any table exists.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
