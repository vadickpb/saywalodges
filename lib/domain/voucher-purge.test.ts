import { describe, expect, it } from "vitest";
import { selectVoucherPurge, VOUCHER_PURGE_LIMIT, type PurgeVoucher } from "./voucher-purge";

const now = Date.parse("2026-11-04T12:00:00Z");
const old = "2026-09-01T12:00:00Z";
const base: PurgeVoucher = {
  id: "00000000-0000-4000-8000-000000000001", path: "org/token/file.pdf",
  created_at: old, org_exists: true, payment_status: null, reviewed_at: null,
  booking_status: null, booking_updated_at: null,
};
const select = (changes: Partial<PurgeVoucher>) => selectVoucherPurge([{ ...base, ...changes }], now);

describe("voucher purge selection", () => {
  it("only selects orphans strictly older than 24 hours", () => {
    expect(select({})).toHaveLength(1);
    expect(select({ created_at: "2026-11-03T12:00:00Z" })).toEqual([]);
    expect(select({ created_at: "2026-11-03T11:59:59Z" })).toHaveLength(1);
    expect(select({ created_at: "2026-11-05T00:00:00Z" })).toEqual([]);
  });
  it.each(["approved", "pending_review"] as const)("always protects %s, including closed bookings and deleted orgs", (payment_status) => {
    expect(select({ payment_status, org_exists: false, reviewed_at: old,
      booking_status: "cancelled", booking_updated_at: old })).toEqual([]);
  });
  it("waits strictly 30 days from rejection", () => {
    expect(select({ payment_status: "rejected", reviewed_at: old })).toHaveLength(1);
    expect(select({ payment_status: "rejected", reviewed_at: "2026-10-05T12:00:00Z" })).toEqual([]);
    expect(select({ payment_status: "rejected", reviewed_at: null })).toEqual([]);
  });
  it.each(["expired", "cancelled"] as const)("can select %s after 30 days from the booking change", (booking_status) => {
    expect(select({ payment_status: "rejected", reviewed_at: null, booking_status, booking_updated_at: old })).toHaveLength(1);
    expect(select({ payment_status: "rejected", reviewed_at: null, booking_status,
      booking_updated_at: "2026-10-05T12:00:00Z" })).toEqual([]);
  });
  it("selects deleted-org objects after the upload grace period", () => {
    expect(select({ org_exists: false, payment_status: "rejected" })).toHaveLength(1);
    expect(select({ org_exists: false, created_at: "2026-11-04T00:00:00Z" })).toEqual([]);
  });
  it("fails closed for invalid times and bounds each run", () => {
    expect(select({ created_at: "invalid" })).toEqual([]);
    expect(selectVoucherPurge([base], NaN)).toEqual([]);
    expect(selectVoucherPurge(Array.from({ length: 150 }, () => base), now)).toHaveLength(VOUCHER_PURGE_LIMIT);
  });
  it("is deterministic on retry and empty after successful removal", () => {
    const objects = [base, { ...base, id: "protected", payment_status: "approved" as const }];
    const first = selectVoucherPurge(objects, now);
    expect(selectVoucherPurge(objects, now)).toEqual(first);
    expect(selectVoucherPurge(objects.filter((o) => !first.includes(o)), now)).toEqual([]);
  });
});
