import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// requireSession/requireMembership call lib/supabase/server.ts's createClient,
// which needs next/headers' real request context — mocked here so the SD-103
// criterion "calling a server action without a session returns an
// authorization error" has an actual automated test, not just manual
// verification. verifySession() (the redirect()-based, page-only sibling) is
// still covered only by manual verification against local Supabase.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getSessionUser, getMembership, requireSession, requireMembership, AuthorizationError } from "./session";

function stubSupabase(getClaims: () => ReturnType<SupabaseClient["auth"]["getClaims"]>) {
  return { auth: { getClaims } } as unknown as SupabaseClient<Database>;
}

describe("getSessionUser", () => {
  it("returns null when there is no session", async () => {
    const supabase = stubSupabase(async () => ({ data: null, error: null }));
    expect(await getSessionUser(supabase)).toBeNull();
  });

  it("returns null when getClaims errors", async () => {
    const supabase = stubSupabase(
      async () => ({ data: null, error: new Error("boom") }) as never
    );
    expect(await getSessionUser(supabase)).toBeNull();
  });

  it("returns null when the claims are missing sub or email", async () => {
    const supabase = stubSupabase(
      async () =>
        ({
          data: { claims: { sub: "user-1" } },
          error: null,
        }) as never
    );
    expect(await getSessionUser(supabase)).toBeNull();
  });

  it("returns null when sub or email is an empty string", async () => {
    const supabase = stubSupabase(
      async () =>
        ({
          data: { claims: { sub: "", email: "" } },
          error: null,
        }) as never
    );
    expect(await getSessionUser(supabase)).toBeNull();
  });

  it("returns the session user when claims are valid", async () => {
    const supabase = stubSupabase(
      async () =>
        ({
          data: { claims: { sub: "user-1", email: "a@example.com" } },
          error: null,
        }) as never
    );
    expect(await getSessionUser(supabase)).toEqual({ id: "user-1", email: "a@example.com" });
  });
});

describe("getMembership", () => {
  function stubFrom(result: { data: unknown; error: unknown }) {
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });
    return { from: from as unknown as SupabaseClient<Database>["from"], select, eq1, eq2, maybeSingle };
  }

  it("returns null when the query errors", async () => {
    const { from } = stubFrom({ data: null, error: new Error("boom") });
    const supabase = { from } as unknown as SupabaseClient<Database>;
    expect(await getMembership(supabase, "org-1", "user-1")).toBeNull();
  });

  it("returns null when there is no matching row", async () => {
    const { from } = stubFrom({ data: null, error: null });
    const supabase = { from } as unknown as SupabaseClient<Database>;
    expect(await getMembership(supabase, "org-1", "user-1")).toBeNull();
  });

  it("returns the membership row when found", async () => {
    const { from } = stubFrom({ data: { role: "owner" }, error: null });
    const supabase = { from } as unknown as SupabaseClient<Database>;
    expect(await getMembership(supabase, "org-1", "user-1")).toEqual({ role: "owner" });
  });

  it("filters by org_id and user_id, not the other way around", async () => {
    const { from, eq1, eq2 } = stubFrom({ data: { role: "owner" }, error: null });
    const supabase = { from } as unknown as SupabaseClient<Database>;
    await getMembership(supabase, "org-1", "user-1");
    expect(eq1).toHaveBeenCalledWith("org_id", "org-1");
    expect(eq2).toHaveBeenCalledWith("user_id", "user-1");
  });
});

describe("requireSession", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it("throws AuthorizationError when there is no session", async () => {
    vi.mocked(createClient).mockResolvedValue(stubSupabase(async () => ({ data: null, error: null })));
    await expect(requireSession()).rejects.toThrow(AuthorizationError);
  });

  it("returns the session user when there is a session", async () => {
    vi.mocked(createClient).mockResolvedValue(
      stubSupabase(
        async () =>
          ({ data: { claims: { sub: "user-1", email: "a@example.com" } }, error: null }) as never
      )
    );
    await expect(requireSession()).resolves.toEqual({ id: "user-1", email: "a@example.com" });
  });
});

describe("requireMembership", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  function stubSupabaseWithMembership(sessionUser: { sub: string; email: string } | null, membership: unknown) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: membership, error: null });
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });
    return {
      auth: {
        getClaims: async () =>
          sessionUser ? ({ data: { claims: sessionUser }, error: null } as never) : { data: null, error: null },
      },
      from,
    } as unknown as SupabaseClient<Database>;
  }

  it("throws AuthorizationError when there is no session", async () => {
    vi.mocked(createClient).mockResolvedValue(stubSupabaseWithMembership(null, null));
    await expect(requireMembership("org-1")).rejects.toThrow(AuthorizationError);
  });

  it("throws AuthorizationError when the user has no membership in the org", async () => {
    vi.mocked(createClient).mockResolvedValue(
      stubSupabaseWithMembership({ sub: "user-1", email: "a@example.com" }, null)
    );
    await expect(requireMembership("org-1")).rejects.toThrow(AuthorizationError);
  });

  it("returns the user and role when the membership exists", async () => {
    vi.mocked(createClient).mockResolvedValue(
      stubSupabaseWithMembership({ sub: "user-1", email: "a@example.com" }, { role: "owner" })
    );
    await expect(requireMembership("org-1")).resolves.toEqual({
      user: { id: "user-1", email: "a@example.com" },
      role: "owner",
    });
  });
});
