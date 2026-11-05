import { describe, expect, it } from "vitest";
import { remainingBalance } from "./payment-balance";

describe("remainingBalance", () => {
  it("shows the full total without payments", () => {
    expect(remainingBalance(25001, [])).toBe(25001);
  });
  it("subtracts only approved payments in cents", () => {
    expect(remainingBalance(25001, [
      { status: "approved", amountCents: 5000 },
      { status: "approved", amountCents: 10001 },
      { status: "pending_review", amountCents: 9000 },
      { status: "rejected", amountCents: 25001 },
    ])).toBe(10000);
  });
  it("shows zero when fully paid", () => {
    expect(remainingBalance(25001, [{ status: "approved", amountCents: 25001 }])).toBe(0);
  });
  it("does not display a negative balance for historical overpayments", () => {
    expect(remainingBalance(10000, [{ status: "approved", amountCents: 12000 }])).toBe(0);
  });
});
