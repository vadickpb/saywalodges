import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string;
};

export type Membership = {
  role: Database["public"]["Enums"]["membership_role"];
};

// Thrown by requireSession()/requireMembership() — the Server Action /
// Route Handler equivalent of the /login redirect that page components
// get from verifySession(). Callers catch this and surface a generic
// "not authorized" response instead of leaking DB error details.
export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

// Pure primitives below take the Supabase client as a parameter instead of
// calling lib/supabase/server.ts themselves, so they're unit-testable with
// a stub client (no next/headers request context required).

export async function getSessionUser(
  supabase: SupabaseClient<Database>
): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const { sub, email } = data.claims;
  if (!sub || !email) return null;
  return { id: sub, email };
}

export async function getMembership(
  supabase: SupabaseClient<Database>,
  orgId: string,
  userId: string
): Promise<Membership | null> {
  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("getMembership failed:", error);
    return null;
  }
  return data;
}

// For page components: no session -> redirect to /login. Must be called
// from the page itself, not a shared layout — layouts don't re-run on
// client-side navigation (Partial Rendering), so a layout-level check
// would not re-verify the session on every route change.
export const verifySession = cache(async (): Promise<SessionUser> => {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect("/login");
  return user;
});

// For Server Actions and Route Handlers: no session -> throw rather than
// redirect, so the caller gets a typed error it can turn into a response
// instead of a server-side navigation.
export const requireSession = cache(async (): Promise<SessionUser> => {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) throw new AuthorizationError("Session required");
  return user;
});

export const requireMembership = cache(
  async (orgId: string): Promise<{ user: SessionUser; role: Membership["role"] }> => {
    const supabase = await createClient();
    const user = await getSessionUser(supabase);
    if (!user) throw new AuthorizationError("Session required");
    const membership = await getMembership(supabase, orgId, user.id);
    if (!membership) throw new AuthorizationError("Not a member of this organization");
    return { user, role: membership.role };
  }
);
