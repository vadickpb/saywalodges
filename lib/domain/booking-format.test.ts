import { describe, expect, it } from "vitest";
import { nightsBetween, showDate, showStamp } from "./booking-format";

describe("booking-format", () => {
  it("counts nights between civil dates, across a month end", () => {
    expect(nightsBetween("2026-11-10", "2026-11-13")).toBe(3);
    expect(nightsBetween("2026-11-29", "2026-12-02")).toBe(3);
  });
  it("shows civil dates without shifting the day (no time zone drift)", () => {
    expect(showDate("2026-11-01")).toContain("1");
    expect(showDate("2026-11-01")).toMatch(/nov/i);
  });
  it("shows an instant in Lima time", () => {
    // 03:00 UTC is 22:00 of the previous day in Lima (UTC-5)
    expect(showStamp("2026-11-05T03:00:00Z")).toMatch(/4/);
  });
});
