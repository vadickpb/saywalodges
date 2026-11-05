import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { purgeVouchers } from "./voucher-purge";

const { rpc, remove, from } = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ rpc, storage: { from } }) }));
const object = {
  id: "00000000-0000-4000-8000-000000000001", path: "private/token/file.pdf",
  created_at: "2026-09-01T00:00:00Z", org_exists: true, payment_status: null,
  reviewed_at: null, booking_status: null, booking_updated_at: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
  from.mockReturnValue({ remove });
  remove.mockResolvedValue({ data: [], error: null });
});
afterEach(() => vi.useRealTimers());
describe("cron voucher purge orchestration", () => {
  it("uses Storage API only after an atomic claim, then does nothing on replay", async () => {
    rpc.mockResolvedValueOnce({ data: [object], error: null }).mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    expect(await purgeVouchers()).toEqual({ selected: 1, deleted: 1 });
    expect(rpc).toHaveBeenNthCalledWith(2, "cron_claim_voucher_purge", { p_id: object.id, p_snapshot: object });
    expect(from).toHaveBeenCalledWith("payment-vouchers");
    expect(remove).toHaveBeenCalledWith([object.path]);
    expect(await purgeVouchers()).toEqual({ selected: 0, deleted: 0 });
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it("does not remove an orphan that became associated before claiming", async () => {
    rpc.mockResolvedValueOnce({ data: [object], error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect(await purgeVouchers()).toEqual({ selected: 1, deleted: 0 });
    expect(remove).not.toHaveBeenCalled();
  });
  it("retries a failed Storage deletion with the same persistent claim", async () => {
    rpc.mockImplementation((name: string) => Promise.resolve({ data: name === "cron_list_voucher_purge" ? [object] : true, error: null }));
    remove.mockResolvedValueOnce({ error: { message: "sensitive" } }).mockResolvedValueOnce({ error: null });
    await expect(purgeVouchers()).rejects.toThrow("Voucher removal failed");
    expect(await purgeVouchers()).toEqual({ selected: 1, deleted: 1 });
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it.each(["approved", "pending_review"])("does not claim %s even if returned by inventory", async (payment_status) => {
    rpc.mockResolvedValueOnce({ data: [{ ...object, payment_status }], error: null });
    expect(await purgeVouchers()).toEqual({ selected: 0, deleted: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });
  it("fails closed for database errors and malformed results", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "sensitive" } });
    await expect(purgeVouchers()).rejects.toThrow("Voucher inventory failed");
    rpc.mockResolvedValueOnce({ data: [{}], error: null });
    await expect(purgeVouchers()).rejects.toThrow();
    expect(remove).not.toHaveBeenCalled();
  });
});
