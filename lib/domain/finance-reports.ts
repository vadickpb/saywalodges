import { PLATFORM_COMMISSION_KEY, nightsBetween, type CategoryTotals, type FinanceEntry, type Totals } from "./finance";
import { monthRange, shiftMonth } from "./finance-view";

// Performance reports (SD-804, ADR 0007): monthly, annual and global figures in
// PEN, in the style of Airbnb's earnings view. Pure: no I/O, no clock, no
// timezone — dates are civil ISO strings. Every figure is derived from one set
// of "slices" (an amount on a date), so the dashboard, the printable statement
// and the Excel export cannot disagree.
//
// Two bases, always named in the UI:
//  - cash ("por cobro"): every entry counts whole on its occurred_on date. What
//    an accountant needs.
//  - stay ("por estadía"): a rental's income — and the commission, cleaning and
//    other costs linked to it — is spread over the nights of the stay, so a stay
//    that crosses a month boundary is split between both months. What
//    occupancy, ADR and RevPAR need. Entries without a stay (general expenses,
//    extra services) stay on their date in both bases.
// Nights, occupancy, ADR and RevPAR are ALWAYS stay-based, whichever basis the
// money uses: they are defined per night.

export type ReportBasis = "stay" | "cash";
export type ReportChannel = "direct" | "airbnb" | "booking" | "other";

export type ReportEntry = FinanceEntry & { channel: ReportChannel | null };

export type ReportUnit = {
  id: string;
  name: string;
  active: boolean;
  // First civil date the house counts as available (its creation date). Nights
  // the owner blocked are NOT subtracted until the calendar exists (SD-807).
  availableFrom: string;
  // Exclusive date the house stopped operating, for an inactive house. Without
  // it an inactive house counts as operating until its last booked night.
  availableUntil?: string | null;
};

export type Period = { from: string; toExclusive: string };

export type ReportError = "INVALID_AMOUNT" | "AMOUNT_OVERFLOW" | "STAY_TOO_LONG" | "INVALID_STAY";

export const MAX_REPORT_STAY_NIGHTS = 3660;

const ZERO = BigInt(0);
// Every amount in the data adds up to at most this, so any sum, difference and
// basis-point ratio computed from it (a ratio can be ~10000x its numerator) is
// still a safe integer: conversion with Number() never loses precision.
const MAX_TOTAL = BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 10_000));
const BPS = BigInt(10_000);

// ─── Slices ─────────────────────────────────────────────────────────────────

type Slice = {
  date: string;
  cents: bigint;
  kind: "income" | "expense";
  categoryId: string;
  categoryKey: string | null;
  unitId: string | null;
  rentalId: string | null; // the rental this amount belongs to, when any
  channel: ReportChannel | null; // that rental's channel
};

type NightSlice = { date: string; cents: bigint; unitId: string | null; rentalId: string; stayNights: number };

export type PreparedReport = {
  cash: Slice[];
  stay: Slice[];
  nights: NightSlice[];
  nightRange: Map<string, { first: string; last: string }>; // booked nights per house
  rentals: Map<string, ReportEntry>;
  // Pass EVERY house, archived ones included: money of a house that is missing
  // here still counts in the totals but not in the per-house table.
  units: ReportUnit[];
};

class ReportFailure extends Error {
  constructor(readonly code: ReportError) {
    super(code);
  }
}

// See MAX_TOTAL: prepareReport only accepts data for which this is exact.
function safe(value: bigint): number {
  return Number(value);
}

// Code-unit order: identical on server and browser whatever the locale.
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Integer division rounded half away from zero (b > 0).
function divRound(a: bigint, b: bigint): bigint {
  const half = b / BigInt(2);
  return a >= ZERO ? (a + half) / b : -((-a + half) / b);
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// Spreads `total` over `count` nights with exact cents: every night gets the
// floor share and the last night takes the remainder (ADR 0007).
export function splitAcrossNights(total: bigint, count: number): bigint[] {
  const n = BigInt(count);
  const base = total / n;
  const rest = total % n;
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? base + rest : base));
}

// A cost linked to a rental follows that rental's nights, but keeps ITS OWN house
// when it has one (the table only checks that both belong to the same org).
function sliceOf(entry: ReportEntry, date: string, cents: bigint, rental: ReportEntry | null): Slice {
  return {
    date,
    cents,
    kind: entry.kind,
    categoryId: entry.categoryId,
    categoryKey: entry.categoryKey,
    unitId: entry.unitId ?? rental?.unitId ?? null,
    rentalId: rental?.id ?? null,
    channel: rental?.channel ?? null,
  };
}

export type PrepareResult = { ok: true; prepared: PreparedReport } | { ok: false; error: ReportError };

export function prepareReport(entries: readonly ReportEntry[], units: readonly ReportUnit[]): PrepareResult {
  try {
    const rentals = new Map<string, ReportEntry>();
    let everything = ZERO;
    for (const e of entries) {
      if (!Number.isSafeInteger(e.amountPenCents) || e.amountPenCents < 0) throw new ReportFailure("INVALID_AMOUNT");
      everything += BigInt(e.amountPenCents);
      if (everything > MAX_TOTAL) throw new ReportFailure("AMOUNT_OVERFLOW");
      if (e.kind === "income" && e.stayStart !== null && e.stayEnd !== null) {
        const length = nightsBetween(e.stayStart, e.stayEnd);
        // The table guarantees stay_end > stay_start; a malformed date gives NaN. Either way do not divide by it.
        if (!Number.isInteger(length) || length < 1) throw new ReportFailure("INVALID_STAY");
        if (length > MAX_REPORT_STAY_NIGHTS) throw new ReportFailure("STAY_TOO_LONG");
        rentals.set(e.id, e);
      }
    }
    const cash: Slice[] = [];
    const stay: Slice[] = [];
    const nights: NightSlice[] = [];

    for (const e of entries) {
      const total = BigInt(e.amountPenCents);
      const rental = e.kind === "income" ? (rentals.get(e.id) ?? null) : e.relatedEntryId ? (rentals.get(e.relatedEntryId) ?? null) : null;
      cash.push(sliceOf(e, e.occurredOn, total, rental));
      if (rental?.stayStart && rental.stayEnd) {
        const start = rental.stayStart;
        const length = nightsBetween(start, rental.stayEnd);
        const parts = splitAcrossNights(total, length);
        parts.forEach((cents, i) => {
          const date = addDays(start, i);
          stay.push(sliceOf(e, date, cents, rental));
          if (e === rental) nights.push({ date, cents, unitId: rental.unitId, rentalId: rental.id, stayNights: length });
        });
      } else {
        stay.push(sliceOf(e, e.occurredOn, total, null));
      }
    }
    const nightRange = new Map<string, { first: string; last: string }>();
    for (const n of nights) {
      if (n.unitId === null) continue;
      const range = nightRange.get(n.unitId);
      if (range === undefined) nightRange.set(n.unitId, { first: n.date, last: n.date });
      else {
        if (n.date < range.first) range.first = n.date;
        if (n.date > range.last) range.last = n.date;
      }
    }
    return { ok: true, prepared: { cash, stay, nights, nightRange, rentals, units: [...units] } };
  } catch (error) {
    if (error instanceof ReportFailure) return { ok: false, error: error.code };
    throw error;
  }
}

// ─── One period ─────────────────────────────────────────────────────────────

export type ChannelRow = {
  channel: ReportChannel | null; // null = income without a rental / channel
  grossCents: number;
  commissionCents: number;
  netCents: number;
  rentals: number;
};

export type UnitPerformance = {
  unitId: string;
  name: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  bookedNights: number;
  availableNights: number;
  occupancyBps: number | null;
  adrCents: number | null; // average daily rate: night revenue / booked nights
  revparCents: number | null; // revenue per available night
  rentals: number;
  avgStayNights: number | null; // one decimal, over the rentals with nights in the period
};

export type Performance = {
  bookedNights: number;
  availableNights: number;
  occupancyBps: number | null;
  adrCents: number | null;
  revparCents: number | null;
};

export type PeriodReport = {
  period: Period;
  basis: ReportBasis;
  totals: Totals;
  byChannel: ChannelRow[];
  // Every category with movement in the period, biggest first (income and expense), for the printable statement.
  byCategory: CategoryTotals[];
  topExpenses: CategoryTotals[];
  units: UnitPerformance[];
  general: { incomeCents: number; expenseCents: number; netCents: number }; // not tied to a house
  performance: Performance;
};

const inPeriod = (date: string, p: Period) => date >= p.from && date < p.toExclusive;

// The window in which a house counts as available: from its creation date — or
// from its first booked night when history was loaded from before it — until it
// stopped operating. An active house has no end. An inactive one ends at the
// later of its declared end and its last booked night (so history is never
// erased and booked nights always fall inside the window); with neither, it is
// never counted as available.
function availableNights(unit: ReportUnit, booked: { first: string; last: string } | undefined, p: Period): number {
  const from = booked !== undefined && booked.first < unit.availableFrom ? booked.first : unit.availableFrom;
  let end: string | null = null;
  if (!unit.active) {
    const lastBooked = booked !== undefined ? addDays(booked.last, 1) : null;
    const declared = unit.availableUntil ?? null;
    end = declared !== null && (lastBooked === null || declared > lastBooked) ? declared : lastBooked;
    if (end === null || end <= from) return 0;
  }
  const start = from > p.from ? from : p.from;
  const stop = end === null || end > p.toExclusive ? p.toExclusive : end;
  return start >= stop ? 0 : nightsBetween(start, stop);
}

function ratio(numerator: bigint, denominator: bigint, scale: bigint): number | null {
  return denominator === ZERO ? null : safe(divRound(numerator * scale, denominator));
}

function totalsOf(income: bigint, expense: bigint): Totals {
  const net = income - expense;
  return { incomeCents: safe(income), expenseCents: safe(expense), netCents: safe(net), marginBps: ratio(net, income, BPS) };
}

export function periodReport(prepared: PreparedReport, period: Period, basis: ReportBasis): PeriodReport {
  const slices = (basis === "cash" ? prepared.cash : prepared.stay).filter((s) => inPeriod(s.date, period));

  let income = ZERO;
  let expense = ZERO;
  const channels = new Map<ReportChannel | "none", { gross: bigint; commission: bigint; rentals: Set<string> }>();
  const categories = new Map<string, { slice: Slice; total: bigint }>(); // income and expense
  const unitMoney = new Map<string, { income: bigint; expense: bigint }>();
  const general = { income: ZERO, expense: ZERO };

  for (const s of slices) {
    const isIncome = s.kind === "income";
    if (isIncome) income += s.cents;
    else expense += s.cents;

    const bucket: { income: bigint; expense: bigint } =
      s.unitId === null ? general : (unitMoney.get(s.unitId) ?? { income: ZERO, expense: ZERO });
    if (isIncome) bucket.income += s.cents;
    else bucket.expense += s.cents;
    if (s.unitId !== null) unitMoney.set(s.unitId, bucket);

    const current = categories.get(s.categoryId);
    categories.set(s.categoryId, { slice: s, total: (current?.total ?? ZERO) + s.cents });

    const key = s.channel ?? "none";
    const row = channels.get(key) ?? { gross: ZERO, commission: ZERO, rentals: new Set<string>() };
    if (isIncome) {
      row.gross += s.cents;
      if (s.rentalId) row.rentals.add(s.rentalId);
      channels.set(key, row);
    } else if (s.categoryKey === PLATFORM_COMMISSION_KEY && s.rentalId) {
      row.commission += s.cents;
      channels.set(key, row);
    }
  }

  // Nights are always stay-based.
  const nights = prepared.nights.filter((n) => inPeriod(n.date, period));
  const perUnit = new Map<string, { booked: number; revenue: bigint; rentals: Map<string, number> }>();
  for (const n of nights) {
    if (n.unitId === null) continue;
    const acc = perUnit.get(n.unitId) ?? { booked: 0, revenue: ZERO, rentals: new Map<string, number>() };
    acc.booked += 1;
    acc.revenue += n.cents;
    acc.rentals.set(n.rentalId, n.stayNights);
    perUnit.set(n.unitId, acc);
  }

  let totalBooked = 0;
  let totalAvailable = 0;
  let totalRevenue = ZERO;
  const units: UnitPerformance[] = [...prepared.units]
    .sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id))
    .map((u) => {
      const perf = perUnit.get(u.id) ?? { booked: 0, revenue: ZERO, rentals: new Map<string, number>() };
      const money = unitMoney.get(u.id) ?? { income: ZERO, expense: ZERO };
      const available = availableNights(u, prepared.nightRange.get(u.id), period);
      totalBooked += perf.booked;
      totalAvailable += available;
      totalRevenue += perf.revenue;
      let stayNights = 0;
      for (const length of perf.rentals.values()) stayNights += length;
      return {
        unitId: u.id,
        name: u.name,
        incomeCents: safe(money.income),
        expenseCents: safe(money.expense),
        netCents: safe(money.income - money.expense),
        bookedNights: perf.booked,
        availableNights: available,
        occupancyBps: ratio(BigInt(perf.booked), BigInt(available), BPS),
        adrCents: ratio(perf.revenue, BigInt(perf.booked), BigInt(1)),
        revparCents: ratio(perf.revenue, BigInt(available), BigInt(1)),
        rentals: perf.rentals.size,
        avgStayNights: perf.rentals.size === 0 ? null : Number(divRound(BigInt(stayNights) * BigInt(10), BigInt(perf.rentals.size))) / 10,
      };
    });

  const byChannel: ChannelRow[] = [...channels]
    .map(([channel, row]) => ({
      channel: channel === "none" ? null : channel,
      grossCents: safe(row.gross),
      commissionCents: safe(row.commission),
      netCents: safe(row.gross - row.commission),
      rentals: row.rentals.size,
    }))
    .sort((a, b) => b.grossCents - a.grossCents || compare(a.channel ?? "", b.channel ?? ""));

  const byCategory: CategoryTotals[] = [...categories.values()]
    .map(({ slice, total }) => ({ categoryId: slice.categoryId, categoryKey: slice.categoryKey, kind: slice.kind, totalCents: safe(total) }))
    .sort((a, b) => b.totalCents - a.totalCents || compare(a.categoryId, b.categoryId));
  const topExpenses = byCategory.filter((c) => c.kind === "expense").slice(0, 5);

  return {
    period,
    basis,
    totals: totalsOf(income, expense),
    byChannel,
    byCategory,
    topExpenses,
    units,
    general: { incomeCents: safe(general.income), expenseCents: safe(general.expense), netCents: safe(general.income - general.expense) },
    performance: {
      bookedNights: totalBooked,
      availableNights: totalAvailable,
      occupancyBps: ratio(BigInt(totalBooked), BigInt(totalAvailable), BPS),
      adrCents: ratio(totalRevenue, BigInt(totalBooked), BigInt(1)),
      revparCents: ratio(totalRevenue, BigInt(totalAvailable), BigInt(1)),
    },
  };
}

// ─── Comparisons ────────────────────────────────────────────────────────────

export type Delta = { cents: number; pctBps: number | null }; // pct null when the baseline is 0
export type Comparison = {
  income: Delta;
  expense: Delta;
  net: Delta;
  occupancyPointsBps: number | null; // current - previous occupancy, in basis points
};

function delta(current: number, previous: number): Delta {
  const diff = BigInt(current) - BigInt(previous);
  const base = BigInt(previous < 0 ? -previous : previous);
  return { cents: safe(diff), pctBps: base === ZERO ? null : safe(divRound(diff * BPS, base)) };
}

export function compareReports(current: PeriodReport, previous: PeriodReport): Comparison {
  const a = current.performance.occupancyBps;
  const b = previous.performance.occupancyBps;
  return {
    income: delta(current.totals.incomeCents, previous.totals.incomeCents),
    expense: delta(current.totals.expenseCents, previous.totals.expenseCents),
    net: delta(current.totals.netCents, previous.totals.netCents),
    occupancyPointsBps: a === null || b === null ? null : a - b,
  };
}

// ─── Monthly ────────────────────────────────────────────────────────────────

export type MonthReport = {
  month: string;
  current: PeriodReport;
  previousMonth: PeriodReport;
  sameMonthLastYear: PeriodReport;
  vsPreviousMonth: Comparison;
  vsLastYear: Comparison;
};

function monthPeriod(month: string): Period {
  const range = monthRange(month);
  if (!range) throw new Error(`invalid month ${month}`);
  return { from: range.from, toExclusive: range.toExclusive };
}

export function monthReport(prepared: PreparedReport, month: string, basis: ReportBasis): MonthReport {
  const current = periodReport(prepared, monthPeriod(month), basis);
  const previousMonth = periodReport(prepared, monthPeriod(shiftMonth(month, -1)), basis);
  const sameMonthLastYear = periodReport(prepared, monthPeriod(shiftMonth(month, -12)), basis);
  return {
    month,
    current,
    previousMonth,
    sameMonthLastYear,
    vsPreviousMonth: compareReports(current, previousMonth),
    vsLastYear: compareReports(current, sameMonthLastYear),
  };
}

// ─── Annual ─────────────────────────────────────────────────────────────────

export type MonthRow = Totals & { month: string } & Performance;
export type YearReport = {
  year: number;
  basis: ReportBasis;
  months: MonthRow[]; // always 12, January to December
  total: PeriodReport;
  previousYear: PeriodReport;
  vsPreviousYear: Comparison;
  best: { month: string; netCents: number } | null; // months with activity only; ties go to the earlier month
  worst: { month: string; netCents: number } | null;
};

export function yearReport(prepared: PreparedReport, year: number, basis: ReportBasis): YearReport {
  const y = String(year).padStart(4, "0");
  const months: MonthRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = `${y}-${String(m).padStart(2, "0")}`;
    const r = periodReport(prepared, monthPeriod(month), basis);
    months.push({ month, ...r.totals, ...r.performance });
  }
  const yearPeriod = (value: string): Period => ({ from: `${value}-01-01`, toExclusive: `${String(Number(value) + 1).padStart(4, "0")}-01-01` });
  const total = periodReport(prepared, yearPeriod(y), basis);
  const previousYear = periodReport(prepared, yearPeriod(String(year - 1).padStart(4, "0")), basis);

  const active = months.filter((m) => m.incomeCents > 0 || m.expenseCents > 0);
  let best: YearReport["best"] = null;
  let worst: YearReport["worst"] = null;
  for (const m of active) {
    if (best === null || m.netCents > best.netCents) best = { month: m.month, netCents: m.netCents };
    if (worst === null || m.netCents < worst.netCents) worst = { month: m.month, netCents: m.netCents };
  }
  return { year, basis, months, total, previousYear, vsPreviousYear: compareReports(total, previousYear), best, worst };
}

// ─── Global ─────────────────────────────────────────────────────────────────

export type GlobalReport = {
  report: PeriodReport;
  ranking: UnitPerformance[]; // by net profit, best first
  // Shares are each rounded, so they may not add up to exactly 10000.
  channelMix: { channel: ReportChannel | null; grossCents: number; shareBps: number }[];
  // A REFERENCE estimate, not a measurement: the weighted commission rate of the Airbnb and Booking rentals applied to
  // the direct gross (assumes the same demand at the same price through the platforms, and that every platform
  // commission was registered). `estimatedCents` is rounded once, from the exact ratio; the rate is for display.
  directSavings: {
    platformCommissionRateBps: number | null;
    estimatedCents: number | null;
  };
  // Averages over the rentals of the period of the costs LINKED to a rental (maintenance is rarely linked to one,
  // so that figure is usually small). The UI should say "ligados a alquileres".
  avgCleaningPerRentalCents: number | null;
  avgMaintenancePerRentalCents: number | null;
};

export function globalReport(prepared: PreparedReport, period: Period, basis: ReportBasis): GlobalReport {
  const report = periodReport(prepared, period, basis);
  const ranking = [...report.units].sort((a, b) => b.netCents - a.netCents || compare(a.name, b.name));

  const grossTotal = report.byChannel.reduce((sum, c) => sum + BigInt(c.grossCents), ZERO);
  const channelMix = report.byChannel.map((c) => ({
    channel: c.channel,
    grossCents: c.grossCents,
    shareBps: ratio(BigInt(c.grossCents), grossTotal, BPS) ?? 0,
  }));

  const platform = report.byChannel.filter((c) => c.channel === "airbnb" || c.channel === "booking");
  const platformGross = platform.reduce((sum, c) => sum + BigInt(c.grossCents), ZERO);
  const platformCommission = platform.reduce((sum, c) => sum + BigInt(c.commissionCents), ZERO);
  const directGross = BigInt(report.byChannel.find((c) => c.channel === "direct")?.grossCents ?? 0);
  const rateBps = ratio(platformCommission, platformGross, BPS);

  const slices = (basis === "cash" ? prepared.cash : prepared.stay).filter((s) => inPeriod(s.date, period));
  const rentalIds = new Set(slices.filter((s) => s.kind === "income" && s.rentalId !== null).map((s) => s.rentalId));
  const costOf = (key: string) => slices.filter((s) => s.categoryKey === key && s.rentalId !== null).reduce((sum, s) => sum + s.cents, ZERO);
  const perRental = (key: string) => ratio(costOf(key), BigInt(rentalIds.size), BigInt(1));

  return {
    report,
    ranking,
    channelMix,
    directSavings: {
      platformCommissionRateBps: rateBps,
      estimatedCents: platformGross === ZERO ? null : safe(divRound(directGross * platformCommission, platformGross)),
    },
    avgCleaningPerRentalCents: perRental("cleaning"),
    avgMaintenancePerRentalCents: perRental("maintenance"),
  };
}
