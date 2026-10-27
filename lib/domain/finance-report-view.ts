import { currentMonth, isMonth } from "./finance-view";

// Pure presentation helpers for the finance reports (SD-804, part 2): number
// formatting and chart geometry. No I/O, no locale or clock: the same input gives
// the same text and the same coordinates on the server and in the browser, and the
// chart maths can be unit-tested instead of eyeballed.

// 6.45 % -> "6,5 %". Integer arithmetic on basis points (1 % = 100), half away
// from zero, so no binary-float surprises. null (no data) -> "—".
export function formatBps(bps: number | null): string {
  if (bps === null) return "—";
  const tenths = Math.floor((Math.abs(bps) + 5) / 10);
  const sign = bps < 0 && tenths !== 0 ? "−" : "";
  return `${sign}${Math.floor(tenths / 10)},${tenths % 10} %`;
}

// A change against a baseline: "+12,5 %", "−3,0 %", "0,0 %"; null baseline -> "—".
export function formatChangeBps(pctBps: number | null): string {
  if (pctBps === null) return "—";
  const text = formatBps(Math.abs(pctBps));
  if (text === "0,0 %") return text;
  return `${pctBps > 0 ? "+" : "−"}${text}`;
}

export type Trend = "up" | "down" | "flat";
export function trendOf(cents: number): Trend {
  return cents > 0 ? "up" : cents < 0 ? "down" : "flat";
}

// "2,5" nights, one decimal; null -> "—".
export function formatNights(value: number | null): string {
  return value === null ? "—" : String(value).replace(".", ",");
}

// ─── Charts ─────────────────────────────────────────────────────────────────

export type ChartSeries = { name: string; values: number[] };
export type ChartBox = { width: number; height: number; left: number; right: number; top: number; bottom: number };

export type ChartBar = { x: number; y: number; width: number; height: number; series: number; label: string; value: number };
export type ChartLayout = {
  bars: ChartBar[];
  ticks: { y: number; value: number }[];
  labels: { x: number; text: string }[];
  max: number;
};

// 1, 2, 5 x 10^k at or above `value`, so the axis ends on a round number.
export function niceMax(value: number): number {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// Grouped vertical bars. Values below zero are drawn as zero (the charts show
// amounts and rates, which are never negative). `ticks` are 4 equal steps.
export function barChartLayout(labels: string[], series: ChartSeries[], box: ChartBox): ChartLayout {
  const plotWidth = box.width - box.left - box.right;
  const plotHeight = box.height - box.top - box.bottom;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const groupWidth = labels.length === 0 ? 0 : plotWidth / labels.length;
  const gap = groupWidth * 0.2;
  const barWidth = series.length === 0 ? 0 : (groupWidth - gap) / series.length;
  const baseline = box.top + plotHeight;

  const bars: ChartBar[] = [];
  labels.forEach((label, i) => {
    series.forEach((s, j) => {
      const value = Math.max(0, s.values[i] ?? 0);
      const height = (value / max) * plotHeight;
      bars.push({
        x: round1(box.left + i * groupWidth + gap / 2 + j * barWidth),
        y: round1(baseline - height),
        width: round1(barWidth),
        height: round1(height),
        series: j,
        label,
        value,
      });
    });
  });
  const ticks = [0, 1, 2, 3, 4].map((k) => ({ y: round1(baseline - (k / 4) * plotHeight), value: (max * k) / 4 }));
  return {
    bars,
    ticks,
    labels: labels.map((text, i) => ({ x: round1(box.left + i * groupWidth + groupWidth / 2), text })),
    max,
  };
}

// ─── URL state ──────────────────────────────────────────────────────────────

export type ReportViewKind = "month" | "year" | "global";
export type ReportParams = {
  view: ReportViewKind;
  basis: "stay" | "cash";
  month: string;
  year: number;
  allTime: boolean; // global view only: every year instead of one
};

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// The address bar is untrusted: anything invalid falls back to the default
// (this month, "por estadía") instead of failing the page.
export function parseReportParams(params: Params, now: Date): ReportParams {
  const view = first(params.view);
  const year = first(params.year);
  const thisMonth = currentMonth(now);
  const month = first(params.month);
  const parsedYear = year !== undefined && /^\d{4}$/.test(year) && Number(year) >= 2000 && Number(year) <= 2100 ? Number(year) : null;
  return {
    view: view === "year" || view === "global" ? view : "month",
    basis: first(params.basis) === "cash" ? "cash" : "stay",
    month: month !== undefined && isMonth(month) ? month : thisMonth,
    year: parsedYear ?? Number(thisMonth.slice(0, 4)),
    allTime: year === "all",
  };
}

// Back to a query string for links that keep the current state.
export function reportQuery(state: Partial<ReportParams>): string {
  const q = new URLSearchParams();
  if (state.view && state.view !== "month") q.set("view", state.view);
  if (state.basis === "cash") q.set("basis", "cash");
  if (state.month) q.set("month", state.month);
  if (state.allTime) q.set("year", "all");
  else if (state.year !== undefined) q.set("year", String(state.year));
  const text = q.toString();
  return text === "" ? "" : `?${text}`;
}
