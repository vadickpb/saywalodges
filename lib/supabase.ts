import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { Database } from "./database.types";

// Server-only client — uses the secret/service-role key, never exposed to the browser.
// Public reads for the site and all admin writes go through this client; there is no
// client-side Supabase usage in this app.
//
// Typed with Database (generated from supabase/migrations via
// `supabase gen types typescript --local` — see SD-002). Regenerate after any
// schema change: `npx supabase gen types typescript --local > lib/database.types.ts`.
export function getSupabase() {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export const PHOTOS_BUCKET = "property-photos";

export function getPublicPhotoUrl(storagePath: string): string {
  return getSupabase().storage.from(PHOTOS_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}
