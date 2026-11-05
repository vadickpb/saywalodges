import { describe, expect, it } from "vitest";
import { manualActionError, manualBookingSchema, manualPaymentSchema, parseMoneyToCents, snapshotDiffers } from "./manual-booking";

const U = "ee204001-0000-4000-8000-000000000001";
const B = "b2000000-0000-4000-8000-000000000001";
const P = "a4130000-0000-4000-8000-000000000001";
const booking = { unitId: U, checkIn: "2030-01-10", checkOut: "2030-01-12", guests: "2", name: " Ana Pérez ", email: " ANA@Example.com ", phone: "+51 999 111 222", lang: "es" };

describe("manualBookingSchema", () => {
  it("trims, lower-cases the e-mail and carries no price field", () => {
    const r = manualBookingSchema.parse(booking);
    expect(r).toMatchObject({ name: "Ana Pérez", email: "ana@example.com", guests: 2 });
    expect(Object.keys(r)).not.toContain("total");
  });
  it("refuses bad dates, order, e-mail, phone, invisible characters and capacity of zero", () => {
    for (const bad of [{ checkIn: "2030-02-30" }, { checkOut: "2030-01-10" }, { email: "nope" }, { phone: "abc" }, { name: "A‮B" }, { guests: "0" }, { lang: "fr" }, { unitId: "x" }]) {
      expect(manualBookingSchema.safeParse({ ...booking, ...bad }).success).toBe(false);
    }
  });
  it("accepts an empty phone", () => expect(manualBookingSchema.safeParse({ ...booking, phone: "" }).success).toBe(true));
});

describe("parseMoneyToCents", () => {
  it("reads plain amounts with a dot or a comma", () => {
    expect(parseMoneyToCents("150")).toBe(15000);
    expect(parseMoneyToCents("150.5")).toBe(15050);
    expect(parseMoneyToCents("150,25")).toBe(15025);
    expect(parseMoneyToCents(" 0.01 ")).toBe(1);
  });
  it("refuses everything else", () => {
    for (const bad of ["", "0", "0.00", "-5", "1e3", "12.345", "abc", "1 000", "99999999"]) expect(parseMoneyToCents(bad)).toBeNull();
  });
});

describe("manualPaymentSchema", () => {
  const ok = { bookingId: B, paymentId: P, amount: "150", method: "cash", reference: " recibo 1 ", fxRate: "" };
  it("turns the amount into cents and an empty rate into null", () => {
    expect(manualPaymentSchema.parse(ok)).toMatchObject({ amount: 15000, fxRate: null, reference: "recibo 1" });
    expect(manualPaymentSchema.parse({ ...ok, fxRate: "3,75" }).fxRate).toBe(3.75);
  });
  it("refuses Mercado Pago, a bad amount, a bad rate and a missing idempotency id", () => {
    for (const bad of [{ method: "mercado_pago" }, { amount: "0" }, { fxRate: "100" }, { fxRate: "abc" }, { paymentId: "" }]) {
      expect(manualPaymentSchema.safeParse({ ...ok, ...bad }).success).toBe(false);
    }
  });
});

describe("manualActionError / snapshotDiffers", () => {
  it("maps known codes and never anything else", () => {
    expect(manualActionError("booking", "23P01")).toMatch(/ocupadas/);
    expect(manualActionError("payment", "22023")).toMatch(/monto/);
    expect(manualActionError("payment", "XX000 secret table name")).not.toMatch(/secret/);
  });
  it("flags only real differences, ignoring spacing and case", () => {
    const guest = { name: "Ana Perez", phone: "+51 999 111 222" };
    expect(snapshotDiffers({ name: "ana perez", phone: "+51999111222" }, guest)).toBe(false);
    expect(snapshotDiffers({ name: "Ana Perez", phone: "+51 900 000 000" }, guest)).toBe(true);
    expect(snapshotDiffers({ name: null, phone: null }, guest)).toBe(false);
  });
});
