import { describe, expect, it } from "vitest";
import { buildMonthGrid, monthWindow, resolveCalendarMonth, resolveUnitId, shiftMonth } from "./public-availability";

// 2026-10-29 12:00 in Lima (17:00Z).
const NOW = new Date("2026-10-29T17:00:00Z");

describe("shiftMonth", () => {
  it("crosses year boundaries in both directions", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-10", 14)).toBe("2027-12");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
  });
});

describe("resolveCalendarMonth", () => {
  it("defaults to the current month in Lima, with no previous month", () => {
    expect(resolveCalendarMonth(undefined, NOW)).toEqual({ month: "2026-10", min: "2026-10", max: "2028-08", prev: null, next: "2026-11" });
  });
  it("uses Lima, not UTC, around midnight", () => {
    // 2026-11-01T03:00Z is still 2026-10-31 22:00 in Lima.
    expect(resolveCalendarMonth(undefined, new Date("2026-11-01T03:00:00Z")).month).toBe("2026-10");
    expect(resolveCalendarMonth(undefined, new Date("2026-11-01T05:00:00Z")).month).toBe("2026-11");
  });
  it("accepts months inside the limits and exposes both neighbours", () => {
    expect(resolveCalendarMonth("2027-02", NOW)).toMatchObject({ month: "2027-02", prev: "2027-01", next: "2027-03" });
  });
  it("clamps months before the current one and beyond the horizon", () => {
    expect(resolveCalendarMonth("2026-09", NOW).month).toBe("2026-10");
    expect(resolveCalendarMonth("2020-01", NOW).month).toBe("2026-10");
    expect(resolveCalendarMonth("2031-01", NOW)).toMatchObject({ month: "2028-08", next: null, prev: "2028-07" });
  });
  it("falls back to the current month for malformed input", () => {
    for (const raw of ["", "2026-13", "2026-00", "2026-1", "2026-10-01", "abc", "0000-01", "2026-10 ", "２０２６-１０"]) {
      expect(resolveCalendarMonth(raw, NOW).month).toBe("2026-10");
    }
  });
});

describe("monthWindow", () => {
  it("is the half-open month and never exceeds the RPC limit of 62 days", () => {
    expect(monthWindow("2027-02")).toEqual({ start: "2027-02-01", end: "2027-03-01" });
    expect(monthWindow("2026-12")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
});

const flat = (weeks: ReturnType<typeof buildMonthGrid>) => weeks.flat().filter((cell) => cell !== null);

describe("buildMonthGrid", () => {
  it("pads weeks to Monday-first rows of 7", () => {
    const weeks = buildMonthGrid("2026-11", [], NOW); // 2026-11-01 is a Sunday
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]!.slice(0, 6).every((cell) => cell === null)).toBe(true);
    expect(weeks[0]![6]?.date).toBe("2026-11-01");
    expect(flat(weeks)).toHaveLength(30);
  });
  it("marks the occupied nights and leaves the check-out day free", () => {
    const grid = flat(buildMonthGrid("2026-11", [{ start: "2026-11-10", end: "2026-11-12" }], NOW));
    const status = (date: string) => grid.find((cell) => cell.date === date)?.status;
    expect(status("2026-11-09")).toBe("free");
    expect(status("2026-11-10")).toBe("occupied");
    expect(status("2026-11-11")).toBe("occupied");
    expect(status("2026-11-12")).toBe("free");
  });
  it("keeps back-to-back stays distinct: A ends the day B starts", () => {
    const grid = flat(buildMonthGrid("2026-11", [{ start: "2026-11-10", end: "2026-11-12" }, { start: "2026-11-12", end: "2026-11-14" }], NOW));
    expect(grid.filter((cell) => cell.status === "occupied").map((cell) => cell.day)).toEqual([10, 11, 12, 13]);
  });
  it("clips ranges that start before and end after the month", () => {
    const grid = flat(buildMonthGrid("2026-12", [{ start: "2026-11-28", end: "2026-12-03" }, { start: "2026-12-30", end: "2027-01-05" }], NOW));
    expect(grid.filter((cell) => cell.status === "occupied").map((cell) => cell.day)).toEqual([1, 2, 30, 31]);
  });
  it("does not show a stay ending on the 1st as occupying that day", () => {
    const grid = flat(buildMonthGrid("2026-12", [{ start: "2026-11-28", end: "2026-12-01" }], NOW));
    expect(grid.some((cell) => cell.status === "occupied")).toBe(false);
  });
  it("marks days before today (Lima) as past, never free, and flags today", () => {
    const grid = flat(buildMonthGrid("2026-10", [{ start: "2026-10-20", end: "2026-10-31" }], NOW));
    const byDay = (day: number) => grid.find((cell) => cell.day === day)!;
    expect(byDay(28).status).toBe("past");
    expect(byDay(29)).toMatchObject({ status: "occupied", today: true });
    expect(byDay(31).status).toBe("free");
    expect(grid.filter((cell) => cell.today)).toHaveLength(1);
  });
  it("handles leap February", () => {
    expect(flat(buildMonthGrid("2028-02", [], NOW))).toHaveLength(29);
    expect(flat(buildMonthGrid("2027-02", [], NOW))).toHaveLength(28);
  });
  it("throws on invalid ranges instead of dropping them", () => {
    expect(() => buildMonthGrid("2026-11", [{ start: "2026-11-12", end: "2026-11-12" }], NOW)).toThrow();
  });
});

describe("resolveUnitId", () => {
  const ids = ["u1", "u2"];
  it("honors only ids of the property's own active units", () => {
    expect(resolveUnitId("u2", ids)).toBe("u2");
    expect(resolveUnitId("foreign", ids)).toBe("u1");
    expect(resolveUnitId(undefined, ids)).toBe("u1");
    expect(resolveUnitId("u1", [])).toBeNull();
  });
});
