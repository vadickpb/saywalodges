import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/anon", () => ({ getSupabaseAnon: () => ({ rpc }) }));
import { getBookingStatus } from "./booking-status";

const TOKEN = "ab".repeat(32);
const snapshot = {
  status: "pending_payment", check_in: "2027-08-10", check_out: "2027-08-13", guests: 2, currency: "USD",
  total_cents: 66000, deposit_cents: 33000, expires_at: "2027-08-01T10:00:00+00:00",
  property_name: "Saywa Lodges", unit_name: "Casa", voucher: "none", hold_lapsed: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getBookingStatus", () => {
  it("passes host and token to the scoped RPC and returns the parsed snapshot", async () => {
    rpc.mockResolvedValue({ data: snapshot, error: null });
    expect(await getBookingStatus("saywa-lodges", TOKEN)).toEqual(snapshot);
    expect(rpc).toHaveBeenCalledWith("get_booking_status", { p_host: "saywa-lodges", p_token: TOKEN });
  });

  it("returns null without touching the DB for a malformed token", async () => {
    for (const bad of ["short", "A".repeat(64), "../etc/passwd", ""]) {
      expect(await getBookingStatus("saywa-lodges", bad)).toBeNull();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns null when the RPC finds nothing (unknown token, other tenant, unpublished)", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await getBookingStatus("demo", TOKEN)).toBeNull();
  });

  it("throws a generic error on RPC failure without leaking the DB message", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "relation bookings secret" } });
    await expect(getBookingStatus("saywa-lodges", TOKEN)).rejects.toThrow("booking status lookup failed");
  });

  it("rejects a snapshot that carries an unexpected shape", async () => {
    rpc.mockResolvedValue({ data: { status: "weird" }, error: null });
    await expect(getBookingStatus("saywa-lodges", TOKEN)).rejects.toThrow("booking status lookup failed");
  });

  it("never exposes guest PII fields even if the RPC returned them", async () => {
    rpc.mockResolvedValue({ data: { ...snapshot, guest_email: "a@b.co", guest_name: "X" }, error: null });
    const result = await getBookingStatus("saywa-lodges", TOKEN);
    expect(result).not.toHaveProperty("guest_email");
    expect(result).not.toHaveProperty("guest_name");
  });
});
