import { describe, expect, it } from "vitest";
import { quoteStay } from "./pricing";

// Twin of supabase/tests/0037_unit_price_overrides.test.sql (SD-421): same scenario, same hand-computed figures.
// 2050-03-04 is a Friday. Base rate 100.00, weekend (Fri/Sat) 120.00, 2 included guests, extra guest 20.00.
const unit = { id: "u", active: true, maxGuests: 4, includedGuests: 2 };
const rates = [{ id: "r", unitId: "u", seasonId: null, nightlyCents: 10000, weekendNightlyCents: 12000, extraGuestCents: 2000, minNights: 1 }];
const range = (startDate: string, endDate: string, nightlyCents: number, minNights: number | null = null) =>
  ({ unitId: "u", startDate, endDate, nightlyCents, minNights });
const quote = (checkIn: string, checkOut: string, priceRanges: ReturnType<typeof range>[], guests = 2) =>
  quoteStay({ unit, currency: "PEN", depositPercent: 50, checkIn, checkOut, guests, rates, seasons: [], fees: [], priceRanges });

describe("per-house price ranges", () => {
  it("replaces the weekday and the weekend price of its dates", () => {
    expect(quote("2050-03-04", "2050-03-07", [range("2050-03-04", "2050-03-07", 20000)])).toMatchObject({ ok: true, quote: { accommodationCents: 60000 } });
  });
  it("prices each night with its own range", () => {
    const ranges = [range("2050-03-04", "2050-03-05", 20000), range("2050-03-05", "2050-03-06", 30000), range("2050-03-06", "2050-03-07", 20000)];
    expect(quote("2050-03-04", "2050-03-07", ranges)).toMatchObject({ ok: true, quote: { accommodationCents: 70000 } });
  });
  it("leaves the nights outside the range on the base and weekend rate", () => {
    expect(quote("2050-03-04", "2050-03-07", [range("2050-03-06", "2050-03-07", 20000)])).toMatchObject({ ok: true, quote: { accommodationCents: 44000 } });
  });
  it("keeps charging extra guests from the winning rate", () => {
    expect(quote("2050-03-04", "2050-03-05", [range("2050-03-04", "2050-03-05", 20000)], 4)).toMatchObject({ ok: true, quote: { accommodationCents: 24000 } });
  });
  it("lets a range set its own minimum stay, judged on the arrival night", () => {
    expect(quote("2050-04-02", "2050-04-04", [range("2050-04-01", "2050-04-10", 9000, 3)])).toEqual({ ok: false, error: { code: "MIN_NIGHTS", requiredNights: 3 } });
    expect(quote("2050-04-02", "2050-04-05", [range("2050-04-01", "2050-04-10", 9000, 3)])).toMatchObject({ ok: true, quote: { accommodationCents: 27000 } });
  });
  it("ignores ranges of other houses and refuses overlapping or malformed ones", () => {
    expect(quote("2050-03-04", "2050-03-05", [{ ...range("2050-03-04", "2050-03-05", 1), unitId: "other" }])).toMatchObject({ ok: true, quote: { accommodationCents: 12000 } });
    expect(quote("2050-03-04", "2050-03-05", [range("2050-03-01", "2050-03-10", 1), range("2050-03-04", "2050-03-06", 2)])).toEqual({ ok: false, error: { code: "INVALID_CONFIGURATION" } });
    expect(quote("2050-03-04", "2050-03-05", [range("2050-03-06", "2050-03-06", 1)])).toEqual({ ok: false, error: { code: "INVALID_CONFIGURATION" } });
  });
  it("is optional: callers that do not know about ranges are unchanged", () => {
    expect(quoteStay({ unit, currency: "PEN", depositPercent: 50, checkIn: "2050-03-04", checkOut: "2050-03-05", guests: 2, rates, seasons: [], fees: [] })).toMatchObject({ ok: true, quote: { accommodationCents: 12000 } });
  });
});
