import { describe, expect, it } from "vitest";
import { calendarKeyboardDate, selectCalendarDate } from "./calendar-selection";

describe("calendar selection", () => {
  const blocks = [{ start: "2026-12-10", end: "2026-12-13" }];
  it("starts on a free date and completes an exclusive range", () => {
    const start = selectCalendarDate(null, "2026-12-08", blocks);
    expect(start).toEqual({ start: "2026-12-08", end: null });
    expect(selectCalendarDate(start, "2026-12-10", blocks)).toEqual({ start: "2026-12-08", end: "2026-12-10" });
  });
  it("does not start on occupied nights but permits the departure day", () => {
    expect(selectCalendarDate(null, "2026-12-10", blocks)).toBeNull();
    expect(selectCalendarDate(null, "2026-12-13", blocks)).toEqual({ start: "2026-12-13", end: null });
  });
  it("keeps the anchor when a proposed range crosses occupied nights", () => {
    const start = { start: "2026-12-08", end: null };
    expect(selectCalendarDate(start, "2026-12-14", blocks)).toBe(start);
  });
  it("keeps the anchor when an earlier occupied date is clicked", () => {
    const start = { start: "2026-12-15", end: null };
    expect(selectCalendarDate(start, "2026-12-11", blocks)).toBe(start);
  });
  it("restarts on an earlier free date and never creates zero nights", () => {
    const start = { start: "2026-12-08", end: null };
    expect(selectCalendarDate(start, start.start, [])).toEqual(start);
    expect(selectCalendarDate(start, "2026-12-07", [])).toEqual({ start: "2026-12-07", end: null });
    expect(selectCalendarDate({ ...start, end: "2026-12-09" }, "2026-12-15", [])).toEqual({ start: "2026-12-15", end: null });
  });
  it("handles month, leap-day and year boundaries", () => {
    for (const [start, end] of [["2026-12-31", "2027-01-02"], ["2028-02-28", "2028-03-01"]]) {
      expect(selectCalendarDate({ start, end: null }, end, [])).toEqual({ start, end });
    }
  });
  it("limits manual ranges to 366 nights", () => {
    const start = { start: "2026-01-01", end: null };
    expect(selectCalendarDate(start, "2027-01-02", [])?.end).toBe("2027-01-02");
    expect(selectCalendarDate(start, "2027-01-03", [])).toBe(start);
  });
});

describe("calendar keyboard movement", () => {
  it("moves by days and weeks across month boundaries", () => {
    expect(calendarKeyboardDate("2026-12-31", "ArrowRight")).toBe("2027-01-01");
    expect(calendarKeyboardDate("2027-01-01", "ArrowLeft")).toBe("2026-12-31");
    expect(calendarKeyboardDate("2027-01-01", "ArrowUp")).toBe("2026-12-25");
    expect(calendarKeyboardDate("2027-01-01", "ArrowDown")).toBe("2027-01-08");
  });
  it("ignores other keys and stays within civil date limits", () => {
    expect(calendarKeyboardDate("2027-01-01", "Enter")).toBeNull();
    expect(calendarKeyboardDate("0001-01-01", "ArrowLeft")).toBeNull();
    expect(calendarKeyboardDate("9999-12-31", "ArrowRight")).toBeNull();
  });
});
