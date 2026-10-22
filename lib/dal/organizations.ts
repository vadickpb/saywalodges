import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { verifySession, type SessionUser } from "@/lib/dal/session";
import { resolveActiveOrgId, ACTIVE_ORG_COOKIE } from "@/lib/domain/org-selection";

// Pure primitives below take the Supabase client as a parameter (same
// pattern as lib/dal/session.ts) so they're unit-testable with a stub
// client, without next/headers' real request context.

export type UserOrganization = {
  id: string;
  name: string;
  role: Database["public"]["Enums"]["membership_role"];
};

// Every org the signed-in user belongs to, for the dashboard's org switcher.
// RLS already scopes this correctly (memberships_select/organizations_select
// use private.is_member), but we still filter by user_id explicitly: without
// it, RLS would return every member's row for orgs this user belongs to, not
// just their own. Ordered by membership age so resolveActiveOrgId's "fall
// back to the first org" (no cookie yet) is a stable, predictable choice
// instead of whatever order Postgres happens to return.
//
// Throws on a DB error instead of the safe-default-empty-list pattern the
// rest of lib/dal/* uses: an empty result here means something very
// different downstream (requireActiveOrg/app/app/layout.tsx render "you
// don't belong to any organization yet, ask to be invited") than a
// transient query failure would, and collapsing those into the same `[]`
// turns a service hiccup into a misleading product message.
export async function getUserOrganizations(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<UserOrganization[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("role, organizations(id, name)")
    .eq("user_id", userId)
    .order("created_at");

  if (error) {
    console.error("getUserOrganizations failed:", error);
    throw new Error("Failed to load organizations");
  }

  return (data ?? [])
    .filter((row) => row.organizations !== null)
    .map((row) => ({
      id: row.organizations!.id,
      name: row.organizations!.name,
      role: row.role,
    }));
}

export type OrgProperty = {
  name: string;
  subdomain: string;
  customDomain: string | null;
};

// For the shell's "Ver mi sitio" link. Returns null when the org doesn't
// have a property yet (a valid state before SD-201 lets owners create one).
export async function getOrgProperty(
  supabase: SupabaseClient<Database>,
  orgId: string
): Promise<OrgProperty | null> {
  const { data, error } = await supabase
    .from("properties")
    .select("name, subdomain, custom_domain")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) {
    console.error("getOrgProperty failed:", error);
    return null;
  }
  if (!data) return null;
  return { name: data.name, subdomain: data.subdomain, customDomain: data.custom_domain };
}

export type ActiveOrgContext = {
  user: SessionUser;
  orgs: UserOrganization[];
  // null only when orgs is empty — callers render the "no organizations"
  // empty state in that case (see app/app/layout.tsx) instead of treating
  // it as an error.
  activeOrg: UserOrganization | null;
};

// The one sanctioned way to get "which org is this dashboard request for".
// Unlike the primitives above, this calls next/headers and lib/dal/session
// itself (same shape as verifySession/requireMembership in session.ts) —
// it's the single place that turns the active-org-id cookie into a real,
// membership-checked org, so a future page can't accidentally trust that
// cookie's value directly (it's client-writable, even though it's httpOnly
// to normal JS — a page must never skip straight to `cookies().get(...)`).
export const requireActiveOrg = cache(async (): Promise<ActiveOrgContext> => {
  const user = await verifySession();
  const supabase = await createClient();
  const orgs = await getUserOrganizations(supabase, user.id);
  const cookieStore = await cookies();
  const activeOrgId = resolveActiveOrgId(orgs, cookieStore.get(ACTIVE_ORG_COOKIE)?.value);
  const activeOrg = orgs.find((org) => org.id === activeOrgId) ?? null;
  return { user, orgs, activeOrg };
});
