import { describe, expect, it } from "vitest";
import { buildPublicRates, formatPublicPrice, formatSeasonRange } from "./public-rates";

const units = [
  { id: "u1", active: true },
  { id: "u2", active: true },
  { id: "off", active: false },
];
const seasons = [
  { id: "high", name: "High season", startDate: "2027-06-01", endDate: "2027-10-01" },
  { id: "past", name: "Old", startDate: "2026-01-01", endDate: "2026-02-01" },
  { id: "empty", name: "No rate", startDate: "2027-12-20", endDate: "2028-01-05" },
];
const rate = (unitId: string, seasonId: string | null, nightlyCents: number, weekendNightlyCents: number | null = null) => ({
  unitId,
  seasonId,
  nightlyCents,
  weekendNightlyCents,
});
const today = "2026-10-30";

describe("buildPublicRates", () => {
  it("derives the base and season minimums from numeric rates, not from text", () => {
    const result = buildPublicRates({
      currency: "USD",
      units,
      seasons,
      rates: [rate("u1", null, 22000), rate("u2", null, 18000), rate("u1", "high", 30000)],
      today,
    });
    expect(result.cards.map((c) => [c.key, c.fromCents])).toEqual([["base", 18000], ["high", 30000]]);
    expect(result.fromCents).toBe(18000);
    expect(result.currency).toBe("USD");
  });

  it("uses a cheaper weekend price as the lowest night", () => {
    const result = buildPublicRates({ currency: "PEN", units, seasons, rates: [rate("u1", null, 20000, 15000)], today });
    expect(result.fromCents).toBe(15000);
  });

  it("keeps an explicit zero price (free is data, not missing)", () => {
    const result = buildPublicRates({ currency: "PEN", units, seasons, rates: [rate("u1", null, 0)], today });
    expect(result.cards[0].fromCents).toBe(0);
  });

  it("ignores rates of inactive or unknown units", () => {
    const result = buildPublicRates({
      currency: "PEN",
      units,
      seasons,
      rates: [rate("off", null, 100), rate("ghost", null, 50), rate("u1", null, 20000)],
      today,
    });
    expect(result.fromCents).toBe(20000);
  });

  it("hides seasons that ended and seasons without a usable rate", () => {
    const result = buildPublicRates({
      currency: "PEN",
      units,
      seasons,
      rates: [rate("u1", "past", 1000), rate("off", "empty", 1000), rate("u1", null, 20000)],
      today,
    });
    expect(result.cards.map((c) => c.key)).toEqual(["base"]);
  });

  it("keeps a season that is running today and orders by start date", () => {
    const result = buildPublicRates({
      currency: "PEN",
      units,
      seasons: [
        { id: "b", name: "B", startDate: "2027-03-01", endDate: "2027-03-10" },
        { id: "a", name: "A", startDate: "2026-10-01", endDate: "2026-11-01" },
      ],
      rates: [rate("u1", "b", 3), rate("u1", "a", 2)],
      today,
    });
    expect(result.cards.map((c) => c.key)).toEqual(["a", "b"]);
  });

  it("returns no cards and no from price when a tenant has no rate", () => {
    const result = buildPublicRates({ currency: "PEN", units, seasons, rates: [], today });
    expect(result).toEqual({ currency: "PEN", cards: [], fromCents: null });
  });

  it("shows only season cards when there is no base rate", () => {
    const result = buildPublicRates({ currency: "PEN", units, seasons, rates: [rate("u1", "high", 30000)], today });
    expect(result.cards.map((c) => c.key)).toEqual(["high"]);
    expect(result.fromCents).toBe(30000);
  });

  it("does not mix tenants: only the rates passed in are priced", () => {
    const a = buildPublicRates({ currency: "PEN", units: [{ id: "a1", active: true }], seasons: [], rates: [rate("a1", null, 10000), rate("b1", null, 100)], today });
    expect(a.fromCents).toBe(10000);
  });
});

describe("formatPublicPrice", () => {
  it("uses S/ for PEN and drops zero decimals", () => {
    expect(formatPublicPrice(22000, "PEN", "es")).toBe("S/ 220");
    expect(formatPublicPrice(22000, "PEN", "en")).toBe("S/ 220");
  });
  it("uses the property currency for USD and keeps real decimals", () => {
    expect(formatPublicPrice(22050, "USD", "en")).toBe("US$ 220.50");
  });
  it("groups thousands per locale", () => {
    expect(formatPublicPrice(123456700, "PEN", "en")).toBe("S/ 1,234,567");
  });
});

describe("formatSeasonRange", () => {
  it("shows the last night, not the exclusive end date", () => {
    expect(formatSeasonRange("2027-06-01", "2027-10-01", "en")).toBe("Jun 1, 2027 – Sep 30, 2027");
  });
  it("collapses a single-night season", () => {
    expect(formatSeasonRange("2027-07-28", "2027-07-29", "en")).toBe("Jul 28, 2027");
  });
  it("localises to Spanish", () => {
    expect(formatSeasonRange("2027-12-31", "2028-01-02", "es")).toMatch(/31.*dic.*2027.*1.*ene.*2028/i);
  });
});
