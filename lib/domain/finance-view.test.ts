import { describe, it, expect } from "vitest";
import {
  currentMonth,
  isMonth,
  ledgerQuery,
  monthLabel,
  monthRange,
  parseLedgerView,
  shiftMonth,
  todayInLima,
} from "./finance-view";

const UUID = "0bcf73ac-1c1d-4418-9982-2edde9a3e50c";

describe("months", () => {
  it("validates YYYY-MM", () => {
    expect(isMonth("2027-03")).toBe(true);
    for (const bad of ["2027-13", "2027-00", "2027-3", "27-03", "0000-05", "2027-03-01", "", "abcd-ef"]) {
      expect(isMonth(bad)).toBe(false);
    }
  });

  it("builds a half-open range, including the December rollover", () => {
    expect(monthRange("2027-03")).toEqual({ from: "2027-03-01", toExclusive: "2027-04-01" });
    expect(monthRange("2027-12")).toEqual({ from: "2027-12-01", toExclusive: "2028-01-01" });
    expect(monthRange("nope")).toBeNull();
  });

  it("shifts across year boundaries in both directions", () => {
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2027-12", 1)).toBe("2028-01");
    expect(shiftMonth("2027-06", 0)).toBe("2027-06");
    expect(shiftMonth("2027-06", 18)).toBe("2028-12");
    expect(() => shiftMonth("bad", 1)).toThrow();
  });

  it("labels months with fixed Spanish names", () => {
    expect(monthLabel("2027-03")).toBe("marzo 2027");
    expect(monthLabel("2027-09")).toBe("septiembre 2027");
    expect(monthLabel("garbage")).toBe("garbage");
  });
});

describe("Lima date", () => {
  it("uses the civil date in UTC-5, not the UTC date", () => {
    expect(todayInLima(new Date("2027-03-02T03:00:00.000Z"))).toBe("2027-03-01"); // 22:00 on the 1st in Lima
    expect(todayInLima(new Date("2027-03-02T05:00:00.000Z"))).toBe("2027-03-02"); // 00:00 in Lima
    expect(todayInLima(new Date("2027-01-01T04:59:59.000Z"))).toBe("2026-12-31");
  });
  it("derives the current month", () => {
    expect(currentMonth(new Date("2027-03-01T04:00:00.000Z"))).toBe("2027-02");
    expect(currentMonth(new Date("2027-03-01T05:00:00.000Z"))).toBe("2027-03");
  });
});

describe("parseLedgerView", () => {
  it("falls back to defaults for missing or invalid input", () => {
    expect(parseLedgerView({}, "2027-03")).toEqual({
      month: "2027-03", kind: undefined, categoryId: undefined, unitId: undefined, general: false,
    });
    const bad = parseLedgerView({ month: "2027-99", kind: "transfer", category: "x", unit: "y" }, "2027-03");
    expect(bad).toEqual({ month: "2027-03", kind: undefined, categoryId: undefined, unitId: undefined, general: false });
  });

  it("reads valid filters, taking the first value of repeated params", () => {
    const view = parseLedgerView({ month: ["2027-05", "2027-06"], kind: "expense", category: UUID, unit: UUID }, "2027-03");
    expect(view).toEqual({ month: "2027-05", kind: "expense", categoryId: UUID, unitId: UUID, general: false });
    expect(parseLedgerView({ kind: "income" }, "2027-03").kind).toBe("income");
  });

  it("understands the general-expenses bucket", () => {
    expect(parseLedgerView({ unit: "general" }, "2027-03")).toMatchObject({ general: true, unitId: undefined });
  });
});

describe("ledgerQuery", () => {
  it("builds a query string and omits empty filters", () => {
    expect(ledgerQuery({})).toBe("");
    expect(ledgerQuery({ month: "2027-03" })).toBe("?month=2027-03");
    expect(ledgerQuery({ month: "2027-03", kind: "income", categoryId: UUID, unitId: UUID })).toBe(
      `?month=2027-03&kind=income&category=${UUID}&unit=${UUID}`
    );
    expect(ledgerQuery({ month: "2027-03", general: true, unitId: UUID })).toBe("?month=2027-03&unit=general");
  });
});
