import { describe, it, expect } from "vitest";
import { checkoutGuestSchema, checkoutError, quoteCheckoutSchema } from "./quote-checkout";
const guest = { token: "a".repeat(64), name: " Ana ", email: " ANA@example.com ", phone: "", terms: "on" };
describe("checkout validation", () => {
  it("accepts normalized guests and strips forged prices, dates, currency and ids", () => {
    expect(checkoutGuestSchema.parse({ ...guest, total_cents: 1, deposit_cents: 0, currency: "PEN", unit_id: "other", check_in: "2030-01-01" }))
      .toEqual({ ...guest, name: "Ana", email: "ana@example.com" });
  });
  it.each([
    { token: "bad" }, { token: "A".repeat(64) }, { name: " " }, { name: "x".repeat(201) },
    { email: "no-email" }, { email: "a".repeat(255)+"@example.com" }, { phone: "123" },
    { phone: "<script>" }, { phone: "1".repeat(31) }, { terms: null }, { terms: true },
  ])("rejects invalid input %o", patch => {
    expect(checkoutGuestSchema.safeParse({ ...guest, ...patch }).success).toBe(false);
  });
  it("accepts optional phone and a valid phone", () => {
    expect(checkoutGuestSchema.safeParse(guest).success).toBe(true);
    expect(checkoutGuestSchema.safeParse({ ...guest, phone: "+51 (999) 000-111" }).success).toBe(true);
  });
  it("maps only known database codes", () => {
    expect(["SD001", "23P01", "P0002", "XX000", "42501"].map(checkoutError))
      .toEqual(["expired", "unavailable", "invalid", "generic", "generic"]);
  });
  it("rejects extra keys even on a redirect snapshot", () => {
    expect(quoteCheckoutSchema.safeParse({ public_token: guest.token }).success).toBe(true);
    expect(quoteCheckoutSchema.safeParse({ public_token: guest.token, guest_email: "private" }).success).toBe(false);
  });
});
