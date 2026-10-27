import { describe, it, expect } from "vitest";
import { barChartLayout, formatBps, formatChangeBps, formatNights, niceMax, parseReportParams, reportQuery, trendOf } from "./finance-report-view";

describe("formatBps", () => {
  it("shows percentages with one comma decimal, rounding half away from zero", () => {
    expect(formatBps(645)).toBe("6,5 %"); // 6.45 %
    expect(formatBps(10000)).toBe("100,0 %");
    expect(formatBps(0)).toBe("0,0 %");
    expect(formatBps(5)).toBe("0,1 %");
    expect(formatBps(4)).toBe("0,0 %");
    expect(formatBps(11111)).toBe("111,1 %");
  });
  it("marks negatives, but never prints a negative zero", () => {
    expect(formatBps(-313)).toBe("−3,1 %");
    expect(formatBps(-4)).toBe("0,0 %");
  });
  it("shows a dash when there is no data", () => {
    expect(formatBps(null)).toBe("—");
  });
});

describe("formatChangeBps", () => {
  it("adds an explicit sign to changes", () => {
    expect(formatChangeBps(1250)).toBe("+12,5 %");
    expect(formatChangeBps(-1250)).toBe("−12,5 %");
    expect(formatChangeBps(0)).toBe("0,0 %");
    expect(formatChangeBps(3)).toBe("0,0 %"); // rounds to nothing: no sign
    expect(formatChangeBps(null)).toBe("—");
  });
});

describe("small helpers", () => {
  it("classifies a trend", () => {
    expect(trendOf(5)).toBe("up");
    expect(trendOf(-5)).toBe("down");
    expect(trendOf(0)).toBe("flat");
  });
  it("formats nights with a comma", () => {
    expect(formatNights(2.5)).toBe("2,5");
    expect(formatNights(4)).toBe("4");
    expect(formatNights(null)).toBe("—");
  });
});

describe("niceMax", () => {
  it("rounds up to 1, 2 or 5 times a power of ten", () => {
    expect(niceMax(1)).toBe(1);
    expect(niceMax(1.5)).toBe(2);
    expect(niceMax(3)).toBe(5);
    expect(niceMax(5)).toBe(5);
    expect(niceMax(5.1)).toBe(10);
    expect(niceMax(100001)).toBe(200000);
    expect(niceMax(0.3)).toBeCloseTo(0.5);
  });
  it("falls back to 1 for nothing to draw", () => {
    for (const v of [0, -5, NaN]) expect(niceMax(v)).toBe(1);
  });
});

describe("barChartLayout", () => {
  const box = { width: 200, height: 120, left: 20, right: 0, top: 10, bottom: 20 }; // plot 180 x 90, baseline y = 100

  it("places grouped bars proportionally on a round axis", () => {
    const layout = barChartLayout(["E", "F"], [{ name: "Ingresos", values: [100, 0] }, { name: "Egresos", values: [50, 200] }], box);
    expect(layout.max).toBe(200);
    const at = (label: string, series: number) => layout.bars.find((b) => b.label === label && b.series === series)!;
    expect(at("E", 0)).toMatchObject({ x: 29, y: 55, width: 36, height: 45, value: 100 });
    expect(at("E", 1)).toMatchObject({ x: 65, y: 77.5, height: 22.5 });
    expect(at("F", 0)).toMatchObject({ x: 119, y: 100, height: 0 });
    expect(at("F", 1)).toMatchObject({ x: 155, y: 10, height: 90 });
    expect(layout.ticks).toEqual([
      { y: 100, value: 0 }, { y: 77.5, value: 50 }, { y: 55, value: 100 }, { y: 32.5, value: 150 }, { y: 10, value: 200 },
    ]);
    expect(layout.labels).toEqual([{ x: 65, text: "E" }, { x: 155, text: "F" }]);
  });

  it("draws negatives and missing values as zero", () => {
    const layout = barChartLayout(["A", "B"], [{ name: "x", values: [-5] }], box);
    expect(layout.bars.map((b) => [b.value, b.height])).toEqual([[0, 0], [0, 0]]);
    expect(layout.max).toBe(1);
  });

  it("copes with no labels or no series", () => {
    expect(barChartLayout([], [{ name: "x", values: [] }], box)).toMatchObject({ bars: [], labels: [], max: 1 });
    expect(barChartLayout(["A"], [], box).bars).toEqual([]);
  });
});

describe("parseReportParams", () => {
  const NOW = new Date("2027-03-15T12:00:00.000Z");

  it("defaults to this month, by stay", () => {
    expect(parseReportParams({}, NOW)).toEqual({ view: "month", basis: "stay", month: "2027-03", year: 2027, allTime: false });
  });

  it("reads valid values, including repeated parameters", () => {
    expect(parseReportParams({ view: "year", basis: "cash", month: "2026-11", year: "2025" }, NOW)).toEqual({
      view: "year", basis: "cash", month: "2026-11", year: 2025, allTime: false,
    });
    expect(parseReportParams({ view: ["global", "year"], month: ["2026-01", "2026-02"] }, NOW)).toMatchObject({ view: "global", month: "2026-01" });
    expect(parseReportParams({ view: "global", year: "all" }, NOW)).toMatchObject({ view: "global", allTime: true, year: 2027 });
  });

  it("falls back for anything invalid", () => {
    const bad = parseReportParams({ view: "pdf", basis: "bitcoin", month: "2027-13", year: "99999" }, NOW);
    expect(bad).toEqual({ view: "month", basis: "stay", month: "2027-03", year: 2027, allTime: false });
    expect(parseReportParams({ year: "1999" }, NOW).year).toBe(2027);
    expect(parseReportParams({ year: "2101" }, NOW).year).toBe(2027);
    expect(parseReportParams({ year: "20x7" }, NOW).year).toBe(2027);
  });
});

describe("reportQuery", () => {
  it("omits defaults and keeps the rest", () => {
    expect(reportQuery({})).toBe("");
    expect(reportQuery({ view: "month", basis: "stay" })).toBe("");
    expect(reportQuery({ view: "year", basis: "cash", month: "2027-03", year: 2026 })).toBe("?view=year&basis=cash&month=2027-03&year=2026");
    expect(reportQuery({ view: "global", allTime: true, year: 2026 })).toBe("?view=global&year=all");
  });
});
