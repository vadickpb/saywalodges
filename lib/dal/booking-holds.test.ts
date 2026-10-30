import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ rpc }) }));
import { expireHolds } from "./booking-holds";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("expireHolds", () => {
  it("calls expire_holds and returns how many holds were released", async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    expect(await expireHolds()).toBe(2);
    expect(rpc).toHaveBeenCalledWith("expire_holds");
  });
  it("throws a generic error when the RPC fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied for table bookings" } });
    await expect(expireHolds()).rejects.toThrow("expire_holds failed");
  });
  it("rejects a non-numeric result", async () => {
    rpc.mockResolvedValue({ data: "2", error: null });
    await expect(expireHolds()).rejects.toThrow("expire_holds failed");
  });
});
