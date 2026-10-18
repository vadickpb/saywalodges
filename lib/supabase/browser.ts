import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

// Session-aware client for Client Components. Cookie handling is automatic
// (document.cookie), kept in sync with the server client so a request can
// read the session either side renders.
//
// Deliberately does NOT import lib/env.ts: that schema also validates
// server-only secrets (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), which
// Next.js never inlines into the browser bundle. Importing it here would
// make envSchema.safeParse(process.env) see those as undefined and throw
// the moment any Client Component imports this module. Reading the two
// NEXT_PUBLIC_ vars as literal process.env property accesses is what lets
// Next.js inline them into the client bundle at build time.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
