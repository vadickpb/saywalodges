import { describe, expect, it } from "vitest";
import { nightlyPrices } from "./nightly-prices";

const base = { id: "r0", unitId: "u1", seasonId: null, nightlyCents: 10000, weekendNightlyCents: 12000, extraGuestCents: 500, minNights: 3 };
const high = { id: "r1", unitId: "u1", seasonId: "s1", nightlyCents: 20000, weekendNightlyCents: null, extraGuestCents: 0, minNights: 2 };
const season = { id: "s1", startDate: "2026-12-24", endDate: "2026-12-27", priority: 1 };

describe("nightlyPrices", () => {
  it("uses weekday, weekend and season rates like a real quote, ignoring minimum nights", () => {
    const prices = nightlyPrices("u1", ["2026-12-21", "2026-12-25", "2026-12-26", "2026-12-27", "2026-12-28"], [base, high], [season], "PEN");
    // 2026-12-21 Mon, 12-25 Fri (season: no weekend rate -> nightly), 12-26 Sat (season), 12-27 Sun, 12-28 Mon
    expect(prices).toEqual({ "2026-12-21": 10000, "2026-12-25": 20000, "2026-12-26": 20000, "2026-12-27": 10000, "2026-12-28": 10000 });
  });
  it("applies the weekend rate outside seasons", () => {
    expect(nightlyPrices("u1", ["2026-12-04"], [base], [], "PEN")["2026-12-04"]).toBe(12000);
  });
  it("returns null when a season has no rate or the unit has no rate", () => {
    expect(nightlyPrices("u1", ["2026-12-25"], [base], [season], "PEN")["2026-12-25"]).toBeNull();
    expect(nightlyPrices("u2", ["2026-12-21"], [base], [], "PEN")["2026-12-21"]).toBeNull();
  });
});
