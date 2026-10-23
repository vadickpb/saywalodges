import { describe, expect, it } from "vitest";
import { MAX_STAY_NIGHTS, quoteStay, type PricingRate, type QuoteStayInput } from "./pricing";

const base: PricingRate = {
  id: "base", unitId: "saywa", seasonId: null, nightlyCents: 22000,
  weekendNightlyCents: null, extraGuestCents: 1000, minNights: 1,
};
const high = { id: "high", startDate: "2027-06-01", endDate: "2027-10-01", priority: 10 };
const highRate: PricingRate = { ...base, id: "high-rate", seasonId: "high", nightlyCents: 30000, extraGuestCents: 3000 };
const holiday = { id: "holiday", startDate: "2027-07-28", endDate: "2027-07-30", priority: 20 };
const holidayRate: PricingRate = { ...base, id: "holiday-rate", seasonId: "holiday", nightlyCents: 50000 };

function input(): QuoteStayInput {
  return {
    unit: { id: "saywa", maxGuests: 13, includedGuests: 4, active: true },
    currency: "USD", depositPercent: 50, checkIn: "2027-06-01", checkOut: "2027-06-03", guests: 4,
    rates: [{ ...base }], seasons: [], fees: [],
  };
}
function quote(patch: Partial<QuoteStayInput> = {}) {
  const result = quoteStay({ ...input(), ...patch });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result.quote;
}
function error(patch: Record<string, unknown>, expected: object) {
  expect(quoteStay({ ...input(), ...patch })).toEqual({ ok: false, error: expected });
}

describe("quoteStay amounts and date boundaries", () => {
  it("returns a complete two-night base quote and deposit in cents", () => {
    const result = quote();
    expect(result).toMatchObject({
      unitId: "saywa", currency: "USD", checkIn: "2027-06-01", checkOut: "2027-06-03", guests: 4,
      nightsCount: 2, accommodationCents: 44000, feesCents: 0, totalCents: 44000,
      depositPercent: 50, depositCents: 22000, balanceCents: 22000,
    });
    expect(result.nights).toEqual(["2027-06-01", "2027-06-02"].map((date) => ({
      date, rateId: "base", seasonId: null, isWeekend: false, nightlyCents: 22000,
      extraGuests: 0, extraGuestUnitCents: 1000, extraGuestTotalCents: 0, totalCents: 22000,
    })));
  });
  it("keeps currency as configured without applying currency conversion", () => {
    expect(quote({ currency: "PEN" }).totalCents).toBe(44000);
    expect(quote({ currency: "PEN" }).currency).toBe("PEN");
  });
  it("prices each side of a season change and excludes checkout", () => {
    const result = quote({ checkIn: "2027-05-31", checkOut: "2027-06-02", seasons: [high], rates: [base, highRate] });
    expect(result.nights.map((n) => n.nightlyCents)).toEqual([22000, 30000]);
    expect(result.totalCents).toBe(52000);
    expect(quote({ checkIn: "2027-05-31", checkOut: "2027-06-01", seasons: [high], rates: [base, highRate] }).totalCents).toBe(22000);
  });
  it("lets USD 500 holiday nights override the USD 300 high season", () => {
    const result = quote({ checkIn: "2027-07-27", checkOut: "2027-07-30", seasons: [high, holiday], rates: [base, highRate, holidayRate] });
    expect(result.nights.map((n) => n.nightlyCents)).toEqual([30000, 50000, 50000]);
    expect(result.totalCents).toBe(130000);
    expect(result.nights.map((n) => n.seasonId)).toEqual(["high", "holiday", "holiday"]);
  });
  it("charges a weekend override only on Friday and Saturday nights", () => {
    const result = quote({ checkIn: "2027-07-22", checkOut: "2027-07-26", rates: [{ ...base, weekendNightlyCents: 25000 }] });
    expect(result.nights.map((n) => n.isWeekend)).toEqual([false, true, true, false]);
    expect(result.nights.map((n) => n.nightlyCents)).toEqual([22000, 25000, 25000, 22000]);
  });
  it("uses the selected season weekend override, including an explicit zero", () => {
    expect(quote({ checkIn: "2027-07-23", checkOut: "2027-07-25", seasons: [high], rates: [base, { ...highRate, weekendNightlyCents: 0 }] }).totalCents).toBe(0);
    const result = quote({ checkIn: "2027-07-23", checkOut: "2027-07-24", seasons: [high], rates: [base, highRate] });
    expect(result.totalCents).toBe(30000);
  });
  it("uses only the highest priority regardless of input order", () => {
    const lowerTwin = { ...high, id: "lower-twin" };
    for (const seasons of [[high, lowerTwin, holiday], [holiday, lowerTwin, high]]) {
      expect(quote({ checkIn: "2027-07-28", checkOut: "2027-07-29", seasons, rates: [base, highRate, holidayRate] }).totalCents).toBe(50000);
    }
  });
  it("can quote a wholly seasonal stay without a base rate", () => {
    expect(quote({ seasons: [high], rates: [highRate] }).totalCents).toBe(60000);
  });
  it("counts leap days and crosses years using date-only values", () => {
    expect(quote({ checkIn: "2028-02-28", checkOut: "2028-03-01" }).nights.map((n) => n.date)).toEqual(["2028-02-28", "2028-02-29"]);
    expect(quote({ checkIn: "2027-12-31", checkOut: "2028-01-02" }).nights.map((n) => n.date)).toEqual(["2027-12-31", "2028-01-01"]);
  });
  it("accepts the exact maximum supported date span", () => {
    expect(quote({ checkIn: "2028-01-01", checkOut: "2029-01-01" }).nightsCount).toBe(MAX_STAY_NIGHTS);
  });
  it("does not mutate or sort caller data and ignores a supplied total", () => {
    const original = { ...input(), totalCents: 1, depositCents: 1 };
    const before = structuredClone(original);
    const result = quoteStay(original);
    expect(original).toEqual(before);
    expect(result.ok && result.quote.totalCents).toBe(44000);
    expect(result.ok && result.quote.depositCents).toBe(22000);
  });
});

describe("quoteStay occupancy, fees and deposits", () => {
  it("charges extra guests nightly using each selected rate", () => {
    const result = quote({ guests: 6, checkIn: "2027-05-31", checkOut: "2027-06-02", seasons: [high], rates: [base, highRate] });
    expect(result.nights.map((n) => n.extraGuestTotalCents)).toEqual([2000, 6000]);
    expect(result.totalCents).toBe(60000);
    expect(result.nights.every((n) => n.extraGuests === 2)).toBe(true);
  });
  it("does not credit money when fewer than the included guests stay", () => {
    expect(quote({ guests: 1 }).totalCents).toBe(44000);
  });
  it("allows exactly capacity and rejects occupancy above it", () => {
    expect(quote({ guests: 13 }).guests).toBe(13);
    error({ guests: 14 }, { code: "CAPACITY_EXCEEDED", maxGuests: 13 });
  });
  it("enforces only the arrival rate minimum, not a later season minimum", () => {
    const rates = [base, { ...highRate, minNights: 10 }];
    expect(quote({ checkIn: "2027-05-31", checkOut: "2027-06-02", seasons: [high], rates }).nightsCount).toBe(2);
    error({ seasons: [high], rates }, { code: "MIN_NIGHTS", requiredNights: 10 });
    expect(quote({ checkOut: "2027-06-11", seasons: [high], rates }).nightsCount).toBe(10);
  });
  it("breaks down all fee types and applies deposit to the complete total", () => {
    const result = quote({ guests: 6, fees: [
      { id: "clean", name: "Limpieza", unitId: "saywa", kind: "per_stay", amountCents: 3000 },
      { id: "night", name: "Cargo nocturno", unitId: "saywa", kind: "per_night", amountCents: 500 },
      { id: "guest", name: "Cargo huésped", unitId: "saywa", kind: "per_guest", amountCents: 1000 },
    ] });
    expect(result.fees.map((f) => [f.quantity, f.totalCents])).toEqual([[1, 3000], [2, 1000], [6, 6000]]);
    expect(result.accommodationCents).toBe(48000);
    expect(result.feesCents).toBe(10000);
    expect(result.totalCents).toBe(58000);
    expect(result.depositCents).toBe(29000);
  });
  it.each([[0, 0], [30, 30], [50, 51], [100, 101]])("rounds a 101-cent total with %i percent to %i cents", (percent, expected) => {
    const result = quote({ checkOut: "2027-06-02", depositPercent: percent, rates: [{ ...base, nightlyCents: 101 }] });
    expect(result.depositCents).toBe(expected);
    expect(result.depositCents + result.balanceCents).toBe(result.totalCents);
  });
  it("supports a free stay and zero fee without a phantom deposit", () => {
    const result = quote({ rates: [{ ...base, nightlyCents: 0 }], fees: [{ id: "free", name: "Sin cargo", unitId: "saywa", kind: "per_stay", amountCents: 0 }] });
    expect(result.totalCents).toBe(0);
    expect(result.depositCents).toBe(0);
    expect(result.balanceCents).toBe(0);
  });
  it("filters prices and charges belonging to another unit", () => {
    const foreign = { ...base, id: "other", unitId: "other-unit", nightlyCents: 1 };
    const result = quote({ rates: [base, foreign], fees: [{ id: "other-fee", unitId: "other-unit", name: "Other", kind: "per_stay", amountCents: 99999 }] });
    expect(result.totalCents).toBe(44000);
    expect(result.fees).toEqual([]);
  });
});

describe("quoteStay invalid configuration and unavailable prices", () => {
  it("rejects an inactive unit", () => {
    error({ unit: { ...input().unit, active: false } }, { code: "UNIT_INACTIVE" });
  });
  it("rejects an included guest count above capacity", () => {
    error({ unit: { ...input().unit, includedGuests: 14 } }, { code: "INVALID_CONFIGURATION" });
  });
  it("reports the first unpriced night", () => {
    error({ rates: [] }, { code: "MISSING_RATE", date: "2027-06-01" });
    error({ checkIn: "2027-09-30", checkOut: "2027-10-02", seasons: [high], rates: [highRate] }, { code: "MISSING_RATE", date: "2027-10-01" });
  });
  it("refuses to fall back to a lower price for an unpriced holiday", () => {
    error({ checkIn: "2027-07-28", checkOut: "2027-07-29", seasons: [high, holiday], rates: [base, highRate] }, { code: "MISSING_RATE", date: "2027-07-28" });
  });
  it("rejects equal winning season priorities in either order", () => {
    const twin = { ...high, id: "twin" };
    for (const seasons of [[high, twin], [twin, high]]) error({ seasons, rates: [base, highRate] }, { code: "AMBIGUOUS_SEASON", date: "2027-06-01" });
  });
  it.each([
    [base, { ...base, id: "second-base" }],
    [base, { ...highRate, id: base.id }],
    [base, highRate, { ...highRate, id: "second-season-rate" }],
    [base, { ...highRate, seasonId: "unknown" }],
  ])("rejects duplicated or dangling rate configuration %j", (...rates) => {
    error({ seasons: [high], rates }, { code: "INVALID_CONFIGURATION" });
  });
  it.each([
    [{ ...high, startDate: "not-a-date" }],
    [{ ...high, endDate: "not-a-date" }],
    [{ ...high, endDate: high.startDate }],
    [high, { ...high }],
  ])("rejects invalid or duplicated season configuration %j", (...seasons) => {
    error({ seasons }, { code: "INVALID_CONFIGURATION" });
  });
  it("rejects duplicate fee ids so a charge cannot be applied twice by accident", () => {
    const fee = { id: "fee", name: "Fee", unitId: "saywa", kind: "per_stay", amountCents: 1 };
    error({ fees: [fee, { ...fee }] }, { code: "INVALID_CONFIGURATION" });
  });
});

describe("quoteStay rejects malformed input and arithmetic overflow", () => {
  it.each([
    { checkIn: "2027-02-29" }, { checkOut: "2027-02-30" },
    { checkIn: "2027-6-01" }, { checkIn: "0000-01-01" },
    { checkIn: "2027-13-01" }, { checkIn: "2027-06-01T00:00:00Z" },
    { checkOut: "2027-06-01" }, { checkOut: "2027-05-31" },
    { checkIn: "2027-01-01", checkOut: "2028-01-03" },
  ])("rejects invalid date range %j", (patch) => error(patch, { code: "INVALID_DATES" }));
  it.each([
    { guests: 0 }, { guests: -1 }, { guests: 1.5 }, { guests: "4" },
    { depositPercent: -1 }, { depositPercent: 101 }, { depositPercent: 0.5 },
    { currency: "EUR" }, { depositPercent: undefined }, { checkIn: null },
    { rates: [{ ...base, nightlyCents: -1 }] },
    { rates: [{ ...base, nightlyCents: Number.NaN }] },
    { rates: [{ ...base, extraGuestCents: 1.5 }] },
    { rates: [{ ...base, weekendNightlyCents: -1 }] },
    { rates: [{ ...base, minNights: 0 }] },
    { seasons: [{ ...high, priority: -1 }] },
    { fees: [{ id: "f", unitId: "saywa", name: "Fee", kind: "invalid", amountCents: 1 }] },
  ])("rejects malformed input %j", (patch) => error(patch, { code: "INVALID_INPUT" }));
  it("rejects unsafe nightly totals instead of returning imprecise cents", () => {
    error({ rates: [{ ...base, nightlyCents: Number.MAX_SAFE_INTEGER }] }, { code: "AMOUNT_OVERFLOW" });
    error({ guests: 6, rates: [{ ...base, extraGuestCents: Number.MAX_SAFE_INTEGER }] }, { code: "AMOUNT_OVERFLOW" });
  });
  it("rejects overflow in fees, including products with guest counts", () => {
    error({ fees: [{ id: "big", name: "Big", unitId: "saywa", kind: "per_stay", amountCents: Number.MAX_SAFE_INTEGER }] }, { code: "AMOUNT_OVERFLOW" });
    error({ fees: [{ id: "big", name: "Big", unitId: "saywa", kind: "per_guest", amountCents: Number.MAX_SAFE_INTEGER }] }, { code: "AMOUNT_OVERFLOW" });
  });
  it("keeps an exactly safe maximum total and its deposit precise", () => {
    const result = quote({ checkOut: "2027-06-02", depositPercent: 100, rates: [{ ...base, nightlyCents: Number.MAX_SAFE_INTEGER }] });
    expect(result.totalCents).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.depositCents).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.balanceCents).toBe(0);
  });
});
