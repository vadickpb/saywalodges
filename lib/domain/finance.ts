import { moneySchema } from "./rates-management";

// Pure finance rules (ADR 0007): no I/O, no clock, no timezone. The database
// stores each entry's PEN amount (finance_entries.amount_pen_cents); the
// summaries below add those stored figures, and toPenCents exists so forms can
// preview exactly what the database will compute. All sums use BigInt and fail
// loudly instead of rounding past Number.MAX_SAFE_INTEGER.

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MICRO = BigInt(1_000_000);
const HALF_MICRO = BigInt(500_000);
const ZERO = BigInt(0);
const DB_MAX_CENTS = 2_147_483_647; // finance_entries.amount_cents is a Postgres integer
const FX_LIMIT_MICRO = BigInt(100_000_000); // fx_rate_pen < 100

// Form input "123.45" -> 12345 cents, exact (reuses SD-207's decimal parser), > 0.
export const positiveMoneySchema = moneySchema.refine((cents) => cents > 0, "El importe debe ser mayor que cero");

export type FinanceCurrency = "PEN" | "USD";
export type FinanceKind = "income" | "expense";

export type FinanceError = "INVALID_AMOUNT" | "FX_REQUIRED" | "FX_NOT_ALLOWED" | "INVALID_FX" | "AMOUNT_OVERFLOW";
export type PenResult = { ok: true; cents: number } | { ok: false; error: FinanceError };

// numeric(12,6) arrives as a string ("3.755000") or a JSON number (3.755).
// Deliberately stricter than Postgres: more than 6 decimals is rejected here
// instead of being rounded on save, so a preview never promises what the
// database would change. Dates in this module come from `date` columns
// (ISO YYYY-MM-DD, validated by Postgres); it does not re-validate them.
function fxToMicro(rate: string | number): bigint | null {
  const text = typeof rate === "number" ? (Number.isFinite(rate) ? rate.toFixed(6) : "") : rate.trim();
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(text);
  if (!match) return null;
  const micro = BigInt(match[1]) * MICRO + BigInt((match[2] ?? "").padEnd(6, "0"));
  return micro > ZERO && micro < FX_LIMIT_MICRO ? micro : null;
}

// Same rules as the table's check constraints plus the generated column:
// PEN converts 1:1 and takes no rate; other currencies need 0 < rate < 100 and
// round half up to the cent (100 x 3.755 = 375.5 -> 376).
export function toPenCents(input: {
  amountCents: number;
  currency: FinanceCurrency;
  fxRatePen?: string | number | null;
}): PenResult {
  const { amountCents, currency, fxRatePen } = input;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > DB_MAX_CENTS) {
    return { ok: false, error: "INVALID_AMOUNT" };
  }
  const hasRate = fxRatePen !== null && fxRatePen !== undefined;
  if (currency === "PEN") {
    return hasRate ? { ok: false, error: "FX_NOT_ALLOWED" } : { ok: true, cents: amountCents };
  }
  if (!hasRate) return { ok: false, error: "FX_REQUIRED" };
  const micro = fxToMicro(fxRatePen);
  if (micro === null) return { ok: false, error: "INVALID_FX" };
  return { ok: true, cents: Number((BigInt(amountCents) * micro + HALF_MICRO) / MICRO) };
}

// ─── Entries and summaries ──────────────────────────────────────────────────

// What reports need from a ledger row. amountPenCents is the database's figure.
export type FinanceEntry = {
  id: string;
  kind: FinanceKind;
  categoryId: string;
  categoryKey: string | null; // system_key; null for user-created categories
  occurredOn: string; // YYYY-MM-DD, cash basis
  amountPenCents: number;
  unitId: string | null;
  relatedEntryId: string | null;
  stayStart: string | null;
  stayEnd: string | null;
};

export const PLATFORM_COMMISSION_KEY = "platform_commission";

export type SummaryError = "INVALID_AMOUNT" | "AMOUNT_OVERFLOW";

export type Totals = {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  // Margin in basis points (1 % = 100), half away from zero; null without income.
  marginBps: number | null;
};
export type MonthTotals = Totals & { month: string };
export type CategoryTotals = { categoryId: string; categoryKey: string | null; kind: FinanceKind; totalCents: number };
export type UnitTotals = Totals & { unitId: string | null };
export type EntrySummary = Totals & {
  byMonth: MonthTotals[];
  byCategory: CategoryTotals[];
  byUnit: UnitTotals[];
};
export type SummaryResult = { ok: true; summary: EntrySummary } | { ok: false; error: SummaryError };

// Code-unit order: identical on server and browser whatever the locale/ICU data
// (a locale-aware comparison would make lists differ between environments).
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

class SummaryFailure extends Error {
  constructor(readonly code: SummaryError) {
    super(code);
  }
}

function safe(value: bigint): number {
  if (value > MAX_SAFE || value < -MAX_SAFE) throw new SummaryFailure("AMOUNT_OVERFLOW");
  return Number(value);
}

function marginBps(net: bigint, income: bigint): number | null {
  if (income === ZERO) return null;
  const scaled = net * BigInt(10_000);
  const half = income / BigInt(2);
  return safe(scaled >= ZERO ? (scaled + half) / income : -((-scaled + half) / income));
}

function totals(income: bigint, expense: bigint): Totals {
  const net = income - expense;
  return { incomeCents: safe(income), expenseCents: safe(expense), netCents: safe(net), marginBps: marginBps(net, income) };
}

type Acc = { income: bigint; expense: bigint };
function add(map: Map<string, Acc>, key: string, entry: FinanceEntry) {
  const acc = map.get(key) ?? { income: ZERO, expense: ZERO };
  if (entry.kind === "income") acc.income += BigInt(entry.amountPenCents);
  else acc.expense += BigInt(entry.amountPenCents);
  map.set(key, acc);
}

function checked(entries: readonly FinanceEntry[]) {
  for (const entry of entries) {
    // The table allows amount_pen_cents = 0 (1 cent at a rate below 0.5), so the
    // invariant is "non-negative safe integer", not "positive".
    if (!Number.isSafeInteger(entry.amountPenCents) || entry.amountPenCents < 0) {
      throw new SummaryFailure("INVALID_AMOUNT");
    }
  }
}

function guarded<T>(run: () => T): { ok: true; value: T } | { ok: false; error: SummaryError } {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    if (error instanceof SummaryFailure) return { ok: false, error: error.code };
    throw error;
  }
}

// Totals (PEN) over entries whose occurred_on falls in [from, to], inclusive
// ISO dates; omit a bound to leave it open. Cash basis: the stay-prorated view
// for occupancy reports is separate (SD-804).
export function summarizeEntries(
  entries: readonly FinanceEntry[],
  range: { from?: string; to?: string } = {}
): SummaryResult {
  const result = guarded(() => {
    checked(entries);
    const inRange = entries.filter(
      (e) => (range.from === undefined || e.occurredOn >= range.from) && (range.to === undefined || e.occurredOn <= range.to)
    );
    let income = ZERO;
    let expense = ZERO;
    const months = new Map<string, Acc>();
    const units = new Map<string, Acc>();
    const categories = new Map<string, { entry: FinanceEntry; total: bigint }>();
    for (const e of inRange) {
      const amount = BigInt(e.amountPenCents);
      if (e.kind === "income") income += amount;
      else expense += amount;
      add(months, e.occurredOn.slice(0, 7), e);
      add(units, e.unitId ?? "", e);
      const current = categories.get(e.categoryId);
      categories.set(e.categoryId, { entry: e, total: (current?.total ?? ZERO) + amount });
    }
    const summary: EntrySummary = {
      ...totals(income, expense),
      byMonth: [...months]
        .sort(([a], [b]) => compare(a, b))
        .map(([month, acc]) => ({ month, ...totals(acc.income, acc.expense) })),
      byCategory: [...categories.values()]
        .map(({ entry, total }) => ({
          categoryId: entry.categoryId,
          categoryKey: entry.categoryKey,
          kind: entry.kind,
          totalCents: safe(total),
        }))
        .sort((a, b) => b.totalCents - a.totalCents || compare(a.categoryId, b.categoryId)),
      byUnit: [...units]
        .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : compare(a, b)))
        .map(([unitId, acc]) => ({ unitId: unitId === "" ? null : unitId, ...totals(acc.income, acc.expense) })),
    };
    return summary;
  });
  return result.ok ? { ok: true, summary: result.value } : result;
}

// ─── Profit per rental ──────────────────────────────────────────────────────

export type RentalProfit = {
  rentalId: string;
  unitId: string | null;
  stayStart: string;
  stayEnd: string;
  nights: number;
  grossCents: number;
  commissionCents: number;
  otherCostsCents: number;
  netCents: number; // gross - commission - other linked costs
};
export type RentalProfitsResult = { ok: true; rentals: RentalProfit[] } | { ok: false; error: SummaryError };

// Whole nights in [start, end): civil dates, UTC only as arithmetic.
export function nightsBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000);
}

// A rental is an income entry with a stay. Its costs are the expenses whose
// related_entry_id points at it; the platform commission is reported apart.
export function rentalProfits(entries: readonly FinanceEntry[]): RentalProfitsResult {
  const result = guarded(() => {
    checked(entries);
    const costsByRental = new Map<string, { commission: bigint; other: bigint }>();
    for (const e of entries) {
      if (e.kind !== "expense" || e.relatedEntryId === null) continue;
      const acc = costsByRental.get(e.relatedEntryId) ?? { commission: ZERO, other: ZERO };
      if (e.categoryKey === PLATFORM_COMMISSION_KEY) acc.commission += BigInt(e.amountPenCents);
      else acc.other += BigInt(e.amountPenCents);
      costsByRental.set(e.relatedEntryId, acc);
    }
    const rentals: RentalProfit[] = [];
    for (const e of entries) {
      if (e.kind !== "income" || e.stayStart === null || e.stayEnd === null) continue;
      const costs = costsByRental.get(e.id) ?? { commission: ZERO, other: ZERO };
      const gross = BigInt(e.amountPenCents);
      rentals.push({
        rentalId: e.id,
        unitId: e.unitId,
        stayStart: e.stayStart,
        stayEnd: e.stayEnd,
        nights: nightsBetween(e.stayStart, e.stayEnd),
        grossCents: safe(gross),
        commissionCents: safe(costs.commission),
        otherCostsCents: safe(costs.other),
        netCents: safe(gross - costs.commission - costs.other),
      });
    }
    return rentals.sort((a, b) => compare(a.stayStart, b.stayStart) || compare(a.rentalId, b.rentalId));
  });
  return result.ok ? { ok: true, rentals: result.value } : result;
}
