import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ical/import", async (original) => ({
  ...(await original<typeof import("@/lib/ical/import")>()),
  fetchCalendar: vi.fn(),
}));
import { fetchCalendar, ImportError } from "@/lib/ical/import";
import { listSyncConflicts, saveImportUrl, syncFeed } from "./ical-sync";
const org = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const id = "f3050000-0000-4000-8000-000000000001";
const token = "f3050000-0000-4000-8000-000000000002";
function fake() {
  const rpc = vi.fn();
  const builder = {
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn(),
    then: vi.fn(),
  };
  const from = vi.fn(() => builder);
  return {
    client: { rpc, from } as unknown as SupabaseClient<Database>,
    rpc,
    from,
    builder,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
describe("sync DAL with session client", () => {
  it("never fetches when the RPC denies access, lease is busy, or payload is malformed", async () => {
    for (const result of [
      { data: null, error: null },
      { data: null, error: { message: "private" } },
      { data: { url: "secret" }, error: null },
    ]) {
      const f = fake();
      f.rpc.mockResolvedValue(result);
      expect(await syncFeed(f.client, org, id)).toBe(false);
      expect(f.rpc).toHaveBeenCalledWith("begin_ical_sync", {
        p_org_id: org,
        p_feed_id: id,
      });
    }
    expect(fetchCalendar).not.toHaveBeenCalled();
  });
  it("persists a validated snapshot using the lease and session org", async () => {
    const f = fake();
    f.rpc
      .mockResolvedValueOnce({
        data: { token, url: "https://ical.booking.com/test" },
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    vi.mocked(fetchCalendar).mockResolvedValue(
      "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n",
    );
    expect(await syncFeed(f.client, org, id)).toBe(true);
    expect(f.rpc).toHaveBeenLastCalledWith("finish_ical_sync", {
      p_org_id: org,
      p_feed_id: id,
      p_token: token,
      p_events: [],
    });
  });
  it.each(["URL", "NETWORK", "SIZE", "FORMAT"] as const)(
    "records only safe %s codes and leaves DB to preserve blocks",
    async (code) => {
      const f = fake();
      f.rpc
        .mockResolvedValueOnce({
          data: { token, url: "https://ical.booking.com/test?secret" },
          error: null,
        })
        .mockResolvedValueOnce({ data: true, error: null });
      vi.mocked(fetchCalendar).mockRejectedValue(new ImportError(code));
      expect(await syncFeed(f.client, org, id)).toBe(false);
      expect(f.rpc).toHaveBeenLastCalledWith("finish_ical_sync", {
        p_org_id: org,
        p_feed_id: id,
        p_token: token,
        p_events: [],
        p_error: code,
      });
    },
  );
  it("does not claim success for stale completion or database failure", async () => {
    vi.mocked(fetchCalendar).mockResolvedValue(
      "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n",
    );
    for (const result of [
      { data: false, error: null },
      { data: null, error: { message: "secret" } },
    ]) {
      const f = fake();
      f.rpc
        .mockResolvedValueOnce({
          data: { token, url: "https://ical.booking.com/test" },
          error: null,
        })
        .mockResolvedValueOnce(result);
      expect(await syncFeed(f.client, org, id)).toBe(false);
    }
    expect(console.error).toHaveBeenCalledWith("ical sync persistence failed");
  });
  it("validates URL without I/O and scopes update by org and feed", async () => {
    const f = fake();
    expect(
      await saveImportUrl(f.client, org, id, "https://localhost/secret"),
    ).toBe(false);
    expect(f.from).not.toHaveBeenCalled();
    f.builder.then.mockImplementation((resolve) =>
      resolve({ data: [{ id }], error: null }),
    );
    expect(
      await saveImportUrl(f.client, org, id, " https://ical.booking.com/test "),
    ).toBe(true);
    expect(f.builder.eq.mock.calls).toEqual([
      ["org_id", org],
      ["id", id],
    ]);
    expect(f.builder.update).toHaveBeenCalledWith({
      import_url: "https://ical.booking.com/test",
    });
    expect(await saveImportUrl(f.client, org, id, "")).toBe(true);
    expect(f.builder.update).toHaveBeenLastCalledWith({ import_url: null });
    f.builder.then.mockImplementation((resolve) =>
      resolve({ data: [], error: null }),
    );
    expect(await saveImportUrl(f.client, org, id, "")).toBe(false);
  });
  it("paginates conflicts and returns a minimal owner DTO", async () => {
    const f = fake();
    const row = {
      id,
      feed_id: id,
      period: "[2031-01-01,2031-01-03)",
      blocking_sources: ["booking"],
    };
    f.builder.range
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, () => row),
        error: null,
      })
      .mockResolvedValueOnce({ data: [row], error: null });
    const rows = await listSyncConflicts(f.client, org);
    expect(rows).toHaveLength(1001);
    expect(rows[0]).toEqual({
      id,
      feedId: id,
      start: "2031-01-01",
      end: "2031-01-03",
      sources: ["booking"],
    });
    expect(f.builder.range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(f.builder.eq).toHaveBeenCalledWith("org_id", org);
    f.builder.range.mockResolvedValueOnce({
      data: null,
      error: { message: "secret" },
    });
    await expect(listSyncConflicts(f.client, org)).rejects.toThrow(
      "No se pudieron cargar los conflictos.",
    );
  });
});
