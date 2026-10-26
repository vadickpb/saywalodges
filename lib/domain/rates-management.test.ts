import { describe, it, expect } from "vitest";
import { moneySchema, seasonInputSchema, rateInputSchema, feeInputSchema, simulationSchema, centsToInput, formatPrice, pricingErrorMessage, pricingSectionSchema } from "./rates-management";
import type { PricingError } from "./pricing";
const unitId = "ee204001-0000-4000-8000-000000000001";
const seasonId = "ee205001-0000-4000-8000-000000000001";
const rate = { unitId, seasonId: "", nightlyAmount: "500", weekendAmount: "", extraAmount: "0", minNights: "1" };

describe("management money inputs", () => {
  it.each([["500", 50000], ["0", 0], ["0.01", 1], [" 12,3 ", 1230], ["10.29", 1029], ["21474836.47", 2147483647]])("converts %s to integer cents", (text, cents) => {
    expect(moneySchema.parse(text)).toBe(cents);
  });
  it.each(["", " ", "-1", "1.001", "1e3", "NaN", "Infinity", "1,234.50", "21474836.48", "999999999999999999999", ".50", "1."])("rejects invalid or overflowing money %s", (text) => {
    expect(moneySchema.safeParse(text).success).toBe(false);
  });
  it("round trips stored cents without losing decimal precision", () => {
    for (const cents of [0, 1, 10, 99, 100, 1029, 2147483647]) expect(moneySchema.parse(centsToInput(cents))).toBe(cents);
  });
  it("formats each property currency", () => {
    expect(formatPrice(50000, "USD")).toContain("500.00");
    expect(formatPrice(123, "PEN")).toContain("1.23");
  });
});
describe("season forms", () => {
  const season = { name: " Navidad ", startDate: "2027-12-24", endDate: "2027-12-26", priority: "20" };
  it("accepts civil ranges crossing a year and trims names", () => {
    expect(seasonInputSchema.parse({ ...season, endDate: "2028-01-02" })).toMatchObject({ name: "Navidad", priority: 20 });
  });
  it.each([
    { endDate: "2027-12-24" }, { endDate: "2027-12-23" }, { startDate: "2027-02-29" },
    { startDate: "0000-01-01" }, { priority: "-1" }, { priority: "1.5" }, { priority: "2147483648" }, { name: " " }, { name: "x".repeat(201) },
  ])("rejects invalid season %j", (changes) => expect(seasonInputSchema.safeParse({ ...season, ...changes }).success).toBe(false));
});
describe("rate and fee forms", () => {
  it("preserves weekend inheritance and explicit zero", () => {
    expect(rateInputSchema.parse(rate)).toEqual({ unitId, seasonId: null, nightlyAmount: 50000, weekendAmount: null, extraAmount: 0, minNights: 1 });
    expect(rateInputSchema.parse({ ...rate, seasonId, weekendAmount: "0", extraAmount: "10.29" })).toMatchObject({ seasonId, weekendAmount: 0, extraAmount: 1029 });
  });
  it.each([{ unitId: "bad" }, { seasonId: "bad" }, { minNights: "0" }, { minNights: "" }, { minNights: "1.5" }, { extraAmount: "-1" }])("rejects invalid rate %j", (changes) => expect(rateInputSchema.safeParse({ ...rate, ...changes }).success).toBe(false));
  it.each(["per_stay", "per_night", "per_guest"])("accepts a %s fee", (kind) => expect(feeInputSchema.parse({ unitId, name: " Limpieza ", kind, amount: "25.10" })).toMatchObject({ name: "Limpieza", amount: 2510 }));
  it("rejects unsupported fee kinds and untrusted scope", () => {
    expect(feeInputSchema.safeParse({ unitId, name: "Fee", kind: "percentage", amount: "1" }).success).toBe(false);
    expect(feeInputSchema.parse({ unitId, name: "Fee", kind: "per_stay", amount: "1", orgId: "foreign" })).not.toHaveProperty("orgId");
  });
});
describe("simulation scenario", () => {
  const scenario = { unitId, checkIn: "2027-07-27", checkOut: "2027-07-30", guests: "13", depositPercent: "50" };
  it("accepts only scenario data, stripping prices and foreign organization", () => {
    expect(simulationSchema.parse({ ...scenario, nightlyCents: 1, currency: "PEN", orgId: "foreign" })).toEqual({ unitId, checkIn: scenario.checkIn, checkOut: scenario.checkOut, guests: 13, depositPercent: 50 });
  });
  it.each([{ checkOut: "2027-07-27" }, { guests: "0" }, { depositPercent: "101" }, { depositPercent: "-1" }, { depositPercent: "12.5" }])("rejects invalid scenario %j", (changes) => expect(simulationSchema.safeParse({ ...scenario, ...changes }).success).toBe(false));
  it.each(["0", "100"])("allows the boundary deposit %s", (depositPercent) => expect(simulationSchema.safeParse({ ...scenario, depositPercent }).success).toBe(true));
  it("limits management to known sections", () => {
    expect(pricingSectionSchema.safeParse("properties").success).toBe(false);
    expect(pricingSectionSchema.parse("rates")).toBe("rates");
  });
});
describe("quote error messages", () => {
  const errors: PricingError[] = [
    { code: "CAPACITY_EXCEEDED", maxGuests: 13 }, { code: "MIN_NIGHTS", requiredNights: 2 },
    { code: "MISSING_RATE", date: "2027-07-28" }, { code: "UNIT_INACTIVE" }, { code: "INVALID_DATES" },
    { code: "AMBIGUOUS_SEASON", date: "2027-07-28" }, { code: "AMOUNT_OVERFLOW" }, { code: "INVALID_CONFIGURATION" }, { code: "INVALID_INPUT" },
  ];
  it.each(errors)("explains $code in Spanish", (error) => expect(pricingErrorMessage(error).length).toBeGreaterThan(10));
});
