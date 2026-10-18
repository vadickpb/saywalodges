import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import type { Database } from "@/lib/database.types";

// Session-aware client for Server Components, Server Actions and Route
// Handlers — reads/writes the auth cookies for the current request so RLS
// policies evaluate against the signed-in user, not the service role.
//
// A new client must be created per request (never shared/cached across
// requests, per @supabase/ssr's own docs) — call this at the top of each
// Server Component, Server Action or Route Handler that needs it.
//
// `setAll` can throw when called from a Server Component (cookies are
// read-only there); that's expected and safe to ignore as long as
// proxy.ts refreshes the session on every request — see @supabase/ssr's
// "Using the middleware pattern is mandatory" guidance.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — proxy.ts's session refresh
          // covers this case.
        }
      },
    },
  });
}
