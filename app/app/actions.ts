"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/dal/session";
import { ACTIVE_ORG_COOKIE } from "@/lib/domain/org-selection";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Called from the org switcher (components/dashboard/org-switcher.tsx).
// Never trusts the submitted orgId — requireMembership() throws unless the
// signed-in user actually has a membership row for it, so this can't be
// used to peek into another org's dashboard by posting an arbitrary id.
export async function setActiveOrg(input: unknown) {
  const { orgId } = z.object({ orgId: z.uuid() }).parse({ orgId: input });
  await requireMembership(orgId);

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/app");
}
