import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/anon", () => ({ getSupabaseAnon: () => ({ rpc }) }));

import { getPublicUnitAvailability, PUBLIC_AVAILABILITY_ERROR } from "./availability";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getPublicUnitAvailability", () => {
  it("asks only for the month window of the given property and unit", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await getPublicUnitAvailability("p1", "u1", "2026-12");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_public_unit_availability", {
      p_property_id: "p1",
      p_unit_id: "u1",
      p_from: "2026-12-01",
      p_to: "2027-01-01",
    });
  });

  it("returns half-open ranges and nothing else", async () => {
    rpc.mockResolvedValue({
      data: [
        { start_date: "2027-01-10", end_date: "2027-01-12", note: "x", source: "ical", feed_id: "f", external_uid: "uid" },
        { start_date: "2027-01-12", end_date: "2027-01-14" },
      ],
      error: null,
    });
    expect(await getPublicUnitAvailability("p1", "u1", "2027-01")).toEqual([
      { start: "2027-01-10", end: "2027-01-12" },
      { start: "2027-01-12", end: "2027-01-14" },
    ]);
  });

  it("maps 42501 to null so the site hides the calendar instead of showing it empty", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "not available" } });
    expect(await getPublicUnitAvailability("p1", "foreign", "2027-02")).toBeNull();
  });

  it("never leaks database error text", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "relation calendar_blocks secret" } });
    const failure = await getPublicUnitAvailability("p1", "u1", "2027-03").catch((e: Error) => e);
    expect(failure).toEqual(new Error(PUBLIC_AVAILABILITY_ERROR));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });

  it("rejects malformed or invalid payloads", async () => {
    rpc.mockResolvedValue({ data: [{ start_date: "2027-04-02", end_date: "2027-04-02" }], error: null });
    await expect(getPublicUnitAvailability("p1", "u1", "2027-04")).rejects.toThrow();
    rpc.mockResolvedValue({ data: { start_date: "2027-05-01" }, error: null });
    await expect(getPublicUnitAvailability("p1", "u1", "2027-05")).rejects.toThrow(PUBLIC_AVAILABILITY_ERROR);
  });
});
