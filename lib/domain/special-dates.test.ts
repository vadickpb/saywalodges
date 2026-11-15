import { describe, expect, it } from "vitest";
import { formatSpecialDateRange, publicSpecialDateName, resolveSpecialDateStatus, specialDateHorizon } from "./special-dates";

describe("special date presentation", () => {
  it.each([
    [true, 120000, "available"],
    [false, 120000, "occupied"],
    [true, null, "inquire"],
    [null, 120000, "inquire"],
  ] as const)("resolves availability %s and price %s to %s", (availability, total, expected) => {
    expect(resolveSpecialDateStatus(availability, total)).toBe(expected);
  });

  it("formats a range across months in Spanish and English", () => {
    expect(formatSpecialDateRange("2027-12-30", "2028-01-02", "es")).toBe("30 dic – 2 ene");
    expect(formatSpecialDateRange("2027-12-30", "2028-01-02", "en")).toBe("Dec 30 – Jan 2");
  });

  it("collapses the month for dates in the same month", () => {
    expect(formatSpecialDateRange("2027-07-28", "2027-07-30", "es")).toBe("28–30 jul");
    expect(formatSpecialDateRange("2027-07-28", "2027-07-30", "en")).toBe("Jul 28–30");
  });

  it("uses the other public name as a fallback", () => {
    expect(publicSpecialDateName({ es: "Año Nuevo", en: "" }, "en")).toBe("Año Nuevo");
  });

  it("uses a calendar horizon and clamps short months", () => {
    expect(specialDateHorizon("2026-11-14")).toBe("2028-05-14");
    expect(specialDateHorizon("2027-08-31")).toBe("2029-02-28");
  });
});
