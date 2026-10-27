import { z } from "zod";

// Pure view helpers for the finance pages (SD-803): month navigation, today in
// Lima, and parsing the URL filters. No I/O; the clock is always a parameter.

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

export function isMonth(value: string): boolean {
  return MONTH.test(value) && !value.startsWith("0000-");
}

// [from, toExclusive) as ISO dates, for `occurred_on >= from and < toExclusive`.
export function monthRange(month: string): { from: string; toExclusive: string } | null {
  if (!isMonth(month)) return null;
  return { from: `${month}-01`, toExclusive: `${shiftMonth(month, 1)}-01` };
}

export function shiftMonth(month: string, delta: number): string {
  const match = MONTH.exec(month);
  if (!match) throw new Error(`shiftMonth: invalid month ${month}`);
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

// "marzo 2027" — fixed Spanish names, so the server and any client agree.
export function monthLabel(month: string): string {
  const match = MONTH.exec(month);
  if (!match) return month;
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

// Civil date in America/Lima (UTC-5, no DST) for an instant: YYYY-MM-DD.
export function todayInLima(now: Date): string {
  return new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

export function currentMonth(now: Date): string {
  return todayInLima(now).slice(0, 7);
}

// ─── URL filters ────────────────────────────────────────────────────────────

export type LedgerView = {
  month: string;
  kind?: "income" | "expense";
  categoryId?: string;
  unitId?: string; // a unit id
  general: boolean; // only entries without a unit
};

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Anything invalid falls back to the default instead of failing the page: the
// filters come from the address bar, so they are untrusted and never reach the
// database unvalidated.
export function parseLedgerView(params: Params, fallbackMonth: string): LedgerView {
  const month = first(params.month);
  const kind = first(params.kind);
  const category = first(params.category);
  const unit = first(params.unit);
  const uuid = z.string().uuid();
  return {
    month: month !== undefined && isMonth(month) ? month : fallbackMonth,
    kind: kind === "income" || kind === "expense" ? kind : undefined,
    categoryId: category !== undefined && uuid.safeParse(category).success ? category : undefined,
    unitId: unit !== undefined && uuid.safeParse(unit).success ? unit : undefined,
    general: unit === "general",
  };
}

// Back to a query string, omitting defaults, for links that keep the filters.
export function ledgerQuery(view: Partial<LedgerView> & { month?: string }): string {
  const q = new URLSearchParams();
  if (view.month) q.set("month", view.month);
  if (view.kind) q.set("kind", view.kind);
  if (view.categoryId) q.set("category", view.categoryId);
  if (view.general) q.set("unit", "general");
  else if (view.unitId) q.set("unit", view.unitId);
  const text = q.toString();
  return text === "" ? "" : `?${text}`;
}
