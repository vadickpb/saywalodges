import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/organizations", () => ({ requireActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/dal/ical-sync", () => ({
  saveImportUrl: vi.fn(),
  syncFeed: vi.fn(),
}));
import { requireActiveOrg } from "@/lib/dal/organizations";
import { createClient } from "@/lib/supabase/server";
import { saveImportUrl, syncFeed } from "@/lib/dal/ical-sync";
import { revalidatePath } from "next/cache";
import { saveImportUrlAction, syncFeedAction } from "./actions";
const id = "f3050000-0000-4000-8000-000000000001";
function data(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
function context(role: string | null) {
  vi.mocked(requireActiveOrg).mockResolvedValue({
    activeOrg: role ? { id: "session-org", role } : null,
  } as Awaited<ReturnType<typeof requireActiveOrg>>);
}
beforeEach(() => {
  vi.clearAllMocks();
  context("owner");
});
describe("owner import actions", () => {
  it.each([null, "staff"])(
    "denies %s before creating client / fetching",
    async (role) => {
      context(role);
      expect(
        (
          await saveImportUrlAction(
            { ok: false },
            data({ id, url: "https://ical.booking.com/test" }),
          )
        ).ok,
      ).toBe(false);
      expect((await syncFeedAction(data({ id }))).ok).toBe(false);
      expect(createClient).not.toHaveBeenCalled();
      expect(syncFeed).not.toHaveBeenCalled();
      expect(saveImportUrl).not.toHaveBeenCalled();
    },
  );
  it("rejects malformed IDs and oversized URL before DAL", async () => {
    expect((await syncFeedAction(data({ id: "invalid" }))).ok).toBe(false);
    expect(
      (
        await saveImportUrlAction(
          { ok: false },
          data({ id, url: "x".repeat(2001) }),
        )
      ).ok,
    ).toBe(false);
    expect(syncFeed).not.toHaveBeenCalled();
    expect(saveImportUrl).not.toHaveBeenCalled();
  });
  it("takes org exclusively from the session and refreshes calendar and feed dashboard", async () => {
    vi.mocked(syncFeed).mockResolvedValue(true);
    expect(await syncFeedAction(data({ id, orgId: "attacker" }))).toEqual({
      ok: true,
    });
    expect(syncFeed).toHaveBeenCalledWith(undefined, "session-org", id);
    expect(revalidatePath).toHaveBeenCalledWith("/app/calendar");
    expect(revalidatePath).toHaveBeenCalledWith("/app/calendar/feeds");
  });
  it("saves URL under owner session and reports safe DAL failures", async () => {
    vi.mocked(saveImportUrl).mockResolvedValue(true);
    expect(
      (
        await saveImportUrlAction(
          { ok: false },
          data({ id, url: "https://ical.booking.com/test", orgId: "attacker" }),
        )
      ).ok,
    ).toBe(true);
    expect(saveImportUrl).toHaveBeenCalledWith(
      undefined,
      "session-org",
      id,
      "https://ical.booking.com/test",
    );
    vi.mocked(saveImportUrl).mockResolvedValue(false);
    vi.mocked(syncFeed).mockResolvedValue(false);
    expect(
      (
        await saveImportUrlAction(
          { ok: false },
          data({ id, url: "https://localhost" }),
        )
      ).ok,
    ).toBe(false);
    expect(await syncFeedAction(data({ id }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("No se pudo sincronizar"),
    });
  });
});
