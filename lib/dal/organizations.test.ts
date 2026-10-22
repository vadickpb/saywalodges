import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getUserOrganizations, getOrgProperty } from "./organizations";

// Minimal query-builder stub: each .from() call gets the response fixed up
// front (these DAL functions issue exactly one query each), same spirit as
// lib/dal/session.test.ts's auth stub.
function stubSupabase(response: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(response),
    then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve),
  };
  return { from: vi.fn(() => builder) } as unknown as SupabaseClient<Database>;
}

describe("getUserOrganizations", () => {
  it("maps membership rows with their org name", async () => {
    const supabase = stubSupabase({
      data: [
        { role: "owner", organizations: { id: "org-1", name: "Saywa Lodges" } },
        { role: "staff", organizations: { id: "org-2", name: "Demo Lodge" } },
      ],
      error: null,
    });
    expect(await getUserOrganizations(supabase, "user-1")).toEqual([
      { id: "org-1", name: "Saywa Lodges", role: "owner" },
      { id: "org-2", name: "Demo Lodge", role: "staff" },
    ]);
  });

  it("drops rows whose org embed is null (orphaned membership) instead of crashing", async () => {
    const supabase = stubSupabase({
      data: [{ role: "owner", organizations: null }],
      error: null,
    });
    expect(await getUserOrganizations(supabase, "user-1")).toEqual([]);
  });

  it("throws on a DB error, distinct from a legitimately empty list", async () => {
    // A thrown error here (vs. the rest of lib/dal/*'s "log + safe default")
    // is deliberate — see the comment on getUserOrganizations. Conflating a
    // query failure with "this user has 0 memberships" would make
    // app/app/layout.tsx show the wrong message (misleadingly telling an
    // existing member to ask for an invite) during a transient DB blip.
    const supabase = stubSupabase({ data: null, error: new Error("boom") });
    await expect(getUserOrganizations(supabase, "user-1")).rejects.toThrow();
  });
});

describe("getOrgProperty", () => {
  it("maps the property row", async () => {
    const supabase = stubSupabase({
      data: { name: "Saywa Lodges", subdomain: "saywa-lodges", custom_domain: null },
      error: null,
    });
    expect(await getOrgProperty(supabase, "org-1")).toEqual({
      name: "Saywa Lodges",
      subdomain: "saywa-lodges",
      customDomain: null,
    });
  });

  it("returns null when the org has no property yet", async () => {
    const supabase = stubSupabase({ data: null, error: null });
    expect(await getOrgProperty(supabase, "org-1")).toBeNull();
  });

  it("returns null on a DB error rather than throwing", async () => {
    const supabase = stubSupabase({ data: null, error: new Error("boom") });
    expect(await getOrgProperty(supabase, "org-1")).toBeNull();
  });
});
