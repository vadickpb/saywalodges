import { describe, it, expect } from "vitest";
import { PUBLIC_TOKEN_PATTERN, resolveBookingState } from "./booking-status";

const base = { status: "pending_payment", voucher: "none", hold_lapsed: false } as const;

describe("resolveBookingState", () => {
  it("asks for payment while the hold is running", () => {
    expect(resolveBookingState(base)).toBe("awaiting_payment");
  });
  it("shows a lapsed hold as expired before the sweep runs", () => {
    expect(resolveBookingState({ ...base, hold_lapsed: true })).toBe("expired");
  });
  it("keeps a voucher under review alive even when the clock lapsed", () => {
    expect(resolveBookingState({ ...base, voucher: "under_review", hold_lapsed: true })).toBe("under_review");
  });
  it("asks for a new voucher after a rejection while the hold runs", () => {
    expect(resolveBookingState({ ...base, voucher: "rejected" })).toBe("voucher_rejected");
  });
  it("shows a rejected voucher on a lapsed hold as expired", () => {
    expect(resolveBookingState({ ...base, voucher: "rejected", hold_lapsed: true })).toBe("expired");
  });
  it.each(["confirmed", "cancelled", "expired"] as const)("passes terminal status %s through", (status) => {
    expect(resolveBookingState({ status, voucher: "none", hold_lapsed: false })).toBe(status);
  });
});

describe("PUBLIC_TOKEN_PATTERN", () => {
  it("accepts 64 lowercase hex chars only", () => {
    expect(PUBLIC_TOKEN_PATTERN.test("a".repeat(64))).toBe(true);
    for (const bad of ["a".repeat(63), "A".repeat(64), "g".repeat(64), "a".repeat(64) + "\n", "../x", ""]) {
      expect(PUBLIC_TOKEN_PATTERN.test(bad)).toBe(false);
    }
  });
});
