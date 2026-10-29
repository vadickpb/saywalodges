import { describe, expect, it } from "vitest";
import { calendarMonth, manualBlockSchema, parseCalendarPeriod, CALENDAR_SOURCES } from "./calendar";
const input = { unitId: "2c19ef14-e784-4a6b-aafd-82af02488d42", start: "2027-12-31", end: "2028-01-02", note: "  Mantenimiento  " };
describe("manual calendar input", () => {
  it("accepts year crossings and trims optional notes", () => {
    expect(manualBlockSchema.parse(input).note).toBe("Mantenimiento");
    expect(manualBlockSchema.parse({ ...input, note: " " }).note).toBe("");
  });
  it.each([
    { end: "2027-12-31" }, { end: "2027-12-30" }, { start: "2027-02-29" },
    { start: "infinity" }, { start: "2027-01-01T00:00:00Z" }, { unitId: "invalid" }, { note: "x".repeat(501) },
    { start: "2027-01-01", end: "2028-01-03" },
  ])("rejects malformed or unbounded form input %o", (override) => {
    expect(manualBlockSchema.safeParse({ ...input, ...override }).success).toBe(false);
  });
  it("accepts exactly 366 nights and a 500 character note", () => {
    expect(manualBlockSchema.safeParse({ ...input, start: "2028-01-01", end: "2029-01-01", note: "x".repeat(500) }).success).toBe(true);
  });
});
describe("calendar presentation", () => {
  it("parses finite half-open periods, including Postgres quoted dates", () => {
    expect(parseCalendarPeriod('["2027-12-31","2028-01-02")')).toEqual({ start: input.start, end: input.end });
    expect(parseCalendarPeriod("[2027-12-31,2028-01-02)")).toEqual({ start: input.start, end: input.end });
  });
  it.each(["empty", "(2027-01-01,2027-01-03]", "[,)", "[2027-02-29,2027-03-02)", "[2027-01-02,2027-01-02)", null, "[2027-01-01,infinity)"])("rejects unsupported DB ranges %s", (value) => {
    expect(() => parseCalendarPeriod(value)).toThrow("Invalid calendar period");
  });
  it("builds Monday-first leap months and safe boundary navigation", () => {
    expect(calendarMonth("2028-02")).toMatchObject({ days: 29, offset: 1, previous: "2028-01", next: "2028-03" });
    expect(calendarMonth("2028-02").dates.at(-1)).toBe("2028-02-29");
    expect(calendarMonth("0001-01").previous).toBeNull();
    expect(calendarMonth("9999-12").next).toBeNull();
    expect(calendarMonth("2027-12").next).toBe("2028-01");
    expect(CALENDAR_SOURCES.ical.label).toContain("sin identificar");
  });
});
