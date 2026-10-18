import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges a PKCE `code` (from a password-recovery email link, currently
// the only flow that lands here) for a session, then redirects onward.
// `next` is restricted to a same-origin relative path to avoid an open
// redirect — it's attacker-controllable (part of the emailed URL's query
// string) even though the `code` itself isn't.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const flowId = searchParams.get("sb_flow_id");
  const next = searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/update-password";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
    console.error("auth/callback: code exchange failed:", error);
  }

  return NextResponse.redirect(`${origin}/login`);
}
