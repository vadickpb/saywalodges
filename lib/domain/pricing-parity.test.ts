import { describe, expect, it } from "vitest";
import { quoteStay } from "./pricing";

// PARITY with the database (ADR 0012). private.price_stay in supabase/migrations/20261103230000_create_public_quote.sql is a SQL port of
// quoteStay, because an anonymous guest cannot be trusted to send prices. The SAME fixture and the SAME hand-computed figures live in
// supabase/tests/0028_public_quote.test.sql. If you change the pricing rules, change both engines and both tests.
//
// Fixture: unit for 6 guests (2 included); base rate 100.00 (weekend Fri/Sat 120.00), extra guest 20.00, min 1 night;
// high season 2040-01 (priority 99) rate 150.00 with no weekend price, extra guest 30.00, min 2 nights;
// fees: cleaning 50.00 per stay, tax 5.00 per night, welcome 10.00 per guest; deposit 50 %.
const unit = { id: "u", active: true, maxGuests: 6, includedGuests: 2 };
const seasons = [{ id: "high", startDate: "2040-01-01", endDate: "2040-02-01", priority: 99 }];
const rates = [
  { id: "r-base", unitId: "u", seasonId: null, nightlyCents: 10000, weekendNightlyCents: 12000, extraGuestCents: 2000, minNights: 1 },
  { id: "r-high", unitId: "u", seasonId: "high", nightlyCents: 15000, weekendNightlyCents: null, extraGuestCents: 3000, minNights: 2 },
];
const fees = [
  { id: "f1", unitId: "u", name: "Limpieza", kind: "per_stay" as const, amountCents: 5000 },
  { id: "f2", unitId: "u", name: "Tasa", kind: "per_night" as const, amountCents: 500 },
  { id: "f3", unitId: "u", name: "Bienvenida", kind: "per_guest" as const, amountCents: 1000 },
];
const quote = (checkIn: string, checkOut: string, guests: number) =>
  quoteStay({ unit, currency: "USD", depositPercent: 50, checkIn, checkOut, guests, rates, seasons, fees });

describe("pricing parity with the SQL engine (golden figures)", () => {
  it("S1: high season Fri-Sun, 4 guests (weekend price absent, 2 extra guests)", () => {
    const r = quote("2040-01-27", "2040-01-30", 4);
    expect(r).toMatchObject({ ok: true, quote: { nightsCount: 3, accommodationCents: 63000, feesCents: 10500, totalCents: 73500, depositCents: 36750, balanceCents: 36750 } });
    if (r.ok) expect(r.quote.fees.map((f) => f.quantity)).toEqual([1, 3, 4]);
  });
  it("S2: base season Fri-Sun uses the weekend price on Fri and Sat only", () => {
    const r = quote("2040-03-02", "2040-03-05", 2);
    expect(r).toMatchObject({ ok: true, quote: { accommodationCents: 34000, feesCents: 8500, totalCents: 42500, depositCents: 21250 } });
    if (r.ok) expect(r.quote.nights.map((n) => [n.isWeekend, n.nightlyCents])).toEqual([[true, 12000], [true, 12000], [false, 10000]]);
  });
  it("S3: a stay that crosses the end of the season prices each night with its own rate", () => {
    const r = quote("2040-01-31", "2040-02-02", 2);
    expect(r).toMatchObject({ ok: true, quote: { accommodationCents: 25000, feesCents: 8000, totalCents: 33000, depositCents: 16500 } });
    if (r.ok) expect(r.quote.nights.map((n) => n.seasonId)).toEqual(["high", null]);
  });
  it("S4: the arrival night's rate sets the minimum stay", () => {
    expect(quote("2040-01-10", "2040-01-11", 2)).toEqual({ ok: false, error: { code: "MIN_NIGHTS", requiredNights: 2 } });
  });
  it("S5: more guests than the unit admits", () => {
    expect(quote("2040-03-02", "2040-03-05", 7)).toEqual({ ok: false, error: { code: "CAPACITY_EXCEEDED", maxGuests: 6 } });
  });
  it("S6: deposit rounds half up on whole cents (odd total)", () => {
    // 1 night base, 2 guests: 10000 + fees 5000 + 500 + 2000 = 17500 -> 50% = 8750; with a 33% policy: (17500*33+50)/100 = 5775
    const r = quoteStay({ unit, currency: "USD", depositPercent: 33, checkIn: "2040-03-05", checkOut: "2040-03-06", guests: 2, rates, seasons, fees });
    expect(r).toMatchObject({ ok: true, quote: { totalCents: 17500, depositCents: 5775 } });
  });
});
