import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/database.types";

// Service-role client — bypasses RLS entirely. Restricted to webhooks, cron
// and RPCs (CLAUDE.md); never import this from a page, component or
// user-facing server action (enforced by the no-restricted-imports ESLint
// rule). Session-aware code must use lib/supabase/server.ts or
// lib/supabase/browser.ts instead.
export function getSupabaseAdmin() {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// PHOTOS_BUCKET/getPublicPhotoUrl moved to lib/storage.ts (SD-104): they
// need no Supabase client at all, so they shouldn't force anything that
// only needs a public photo URL — like the public site's DAL — to pull in
// this service-role module.
export { PHOTOS_BUCKET, getPublicPhotoUrl } from "@/lib/storage";
