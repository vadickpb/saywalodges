import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/database.types";

// Anonymous, cookie-free client for the public tenant site (ADR-0002):
// visitors are never authenticated here, so there's no session to plumb —
// RLS enforces access via the anon role alone. Distinct from
// lib/supabase/server.ts, which is cookie-aware for the dashboard's
// logged-in sessions.
export function getSupabaseAnon() {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}
