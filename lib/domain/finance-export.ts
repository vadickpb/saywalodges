import { CHANNEL_LABELS, PAYMENT_METHOD_LABELS } from "./finance-forms";
import {
  addDays,
  periodReport,
  prepareReport,
  type Period,
  type ReportChannel,
  type ReportError,
  type ReportUnit,
} from "./finance-reports";
import { monthLabel, monthRange, shiftMonth, todayInLima } from "./finance-view";

// The accountant's workbook as plain data (SD-805). No I/O and no spreadsheet
// library: the writer in lib/finance-xlsx.ts turns this model into an .xlsx, and
// the tests can read the figures here without opening a file. Money columns hold
// integer cents (the writer shows them as soles with two decimals); date columns
// hold ISO dates (the writer stores real Excel dates).
//
// Basis: the entry sheets and the summaries are POR COBRO (an entry counts on the
// day it was paid or collected), which is what an accountant files. The
// performance sheet is POR ESTADÍA (rentals spread over their nights), the only
// basis in which occupancy and rates mean anything, and its name says so.

export type ColumnKind = "text" | "date" | "money" | "int" | "percent" | "rate";
export type Column = { header: string; kind: ColumnKind; width: number; sum?: boolean };
export type CellValue = string | number | null;
export type Block = { title?: string; columns: Column[]; rows: CellValue[][]; totals: boolean };
export type Sheet = {
  name: string;
  notes: string[]; // lines above the first block (summary sheet only)
  blocks: Block[];
  filter: boolean; // autofilter over the first block's data
};
export type ExportModel = { sheets: Sheet[] };

export type ExportEntry = {
  id: string;
  kind: "income" | "expense";
  categoryId: string;
  occurredOn: string;
  amountCents: number;
  currency: "PEN" | "USD";
  fxRatePen: number | null;
  amountPenCents: number;
  unitId: string | null;
  paymentMethod: keyof typeof PAYMENT_METHOD_LABELS | null;
  counterparty: string | null;
  note: string | null;
  stayStart: string | null;
  stayEnd: string | null;
  channel: ReportChannel | null;
  relatedEntryId: string | null;
  hasReceipt: boolean;
};
export type ExportCategory = { id: string; name: string; systemKey: string | null };

export type ExportInput = {
  entries: readonly ExportEntry[];
  categories: readonly ExportCategory[];
  units: readonly ReportUnit[];
  period: Period;
  propertyName: string;
  now: Date;
};
export type ExportResult = { ok: true; model: ExportModel } | { ok: false; error: ReportError };

// ─── Period from the URL ────────────────────────────────────────────────────

export const MAX_EXPORT_DAYS = 1830; // five years

// Why an export was refused, shown on the reports page (the code travels in the URL).
export const EXPORT_ERRORS = {
  period: "El período no es válido: revisa las fechas (\"Hasta\" no puede ser anterior a \"Desde\" y el máximo es de 5 años).",
  partial: "Hay demasiados movimientos para exportar de una vez; el archivo saldría incompleto.",
  invalid: "No se pudo generar el archivo: hay movimientos con datos inválidos.",
} as const;

export type ExportPeriod = { period: Period; slug: string };
type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);

// ?month=2027-03 | ?year=2027 | ?from=2027-01-15&to=2027-03-31 (inclusive).
// The address bar is untrusted: anything else is null, never a guess.
export function parseExportPeriod(params: Params): ExportPeriod | null {
  const month = first(params.month);
  if (month !== undefined) {
    const range = monthRange(month);
    return range === null ? null : { period: range, slug: month };
  }
  const year = first(params.year);
  if (year !== undefined) {
    if (!/^\d{4}$/.test(year) || Number(year) < 2000 || Number(year) > 2100) return null;
    return { period: { from: `${year}-01-01`, toExclusive: `${Number(year) + 1}-01-01` }, slug: year };
  }
  const from = first(params.from);
  const to = first(params.to);
  if (from === undefined || to === undefined || !isIsoDate(from) || !isIsoDate(to) || to < from) return null;
  if (daysBetween(from, to) + 1 > MAX_EXPORT_DAYS) return null;
  return { period: { from, toExclusive: addDays(to, 1) }, slug: `${from}_${to}` };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Sums of cents. prepareReport (called first) already proved that the sum of ALL
// the ledger's amounts is a safe integer, so any subset of it is too.
const total = (values: readonly number[]) => values.reduce((acc, v) => acc + v, 0);

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const inPeriod = (date: string, p: Period) => date >= p.from && date < p.toExclusive;
const byDateThenId = (a: ExportEntry, b: ExportEntry) =>
  a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const byNameThenKey = (a: [string, number], b: [string, number]) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

function monthsOf(p: Period): string[] {
  const out: string[] = [];
  const last = addDays(p.toExclusive, -1).slice(0, 7);
  for (let m = p.from.slice(0, 7); m <= last; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

function groupByMonth<T extends { date: string }>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.date.slice(0, 7);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

function clip(month: string, p: Period): Period {
  const start = `${month}-01`;
  const end = `${shiftMonth(month, 1)}-01`;
  return { from: start > p.from ? start : p.from, toExclusive: end < p.toExclusive ? end : p.toExclusive };
}

const channelLabel = (c: ReportChannel | null) => (c === null ? null : CHANNEL_LABELS[c]);

// ─── Builder ────────────────────────────────────────────────────────────────

export function buildExportModel(input: ExportInput): ExportResult {
  const { period, units } = input;
  const categoryName = new Map(input.categories.map((c) => [c.id, c.name]));
  const categoryKey = new Map(input.categories.map((c) => [c.id, c.systemKey]));
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const nameOf = (id: string) => categoryName.get(id) ?? "Sin categoría";
  const houseOf = (id: string | null) => (id === null ? "General (sin casa)" : (unitName.get(id) ?? "Casa eliminada"));
  const byId = new Map(input.entries.map((e) => [e.id, e]));

  const inRange = input.entries.filter((e) => inPeriod(e.occurredOn, period)).sort(byDateThenId);
  const incomes = inRange.filter((e) => e.kind === "income");
  const expenses = inRange.filter((e) => e.kind === "expense");

  const prepared = prepareReport(
    input.entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      categoryId: e.categoryId,
      categoryKey: categoryKey.get(e.categoryId) ?? null,
      occurredOn: e.occurredOn,
      amountPenCents: e.amountPenCents,
      unitId: e.unitId,
      relatedEntryId: e.relatedEntryId,
      stayStart: e.stayStart,
      stayEnd: e.stayEnd,
      channel: e.channel,
    })),
    units
  );
  if (!prepared.ok) return { ok: false, error: prepared.error };

  const lastDay = addDays(period.toExclusive, -1);

  // ── Resumen ──
  const months = monthsOf(period);
  const monthRows = months.map((m) => {
    const inc = total(incomes.filter((e) => e.occurredOn.startsWith(m)).map((e) => e.amountPenCents));
    const exp = total(expenses.filter((e) => e.occurredOn.startsWith(m)).map((e) => e.amountPenCents));
    return [monthLabel(m), inc, exp, inc - exp];
  });
  const byCategory = (rows: readonly ExportEntry[]) => {
    const sums = new Map<string, number>();
    for (const e of rows) sums.set(nameOf(e.categoryId), (sums.get(nameOf(e.categoryId)) ?? 0) + e.amountPenCents);
    return [...sums.entries()].sort(byNameThenKey).map(([name, cents]) => [name, cents]);
  };
  const houseKeys = [...new Set(inRange.map((e) => e.unitId))];
  const houseRows = houseKeys
    .map((id) => {
      const inc = total(incomes.filter((e) => e.unitId === id).map((e) => e.amountPenCents));
      const exp = total(expenses.filter((e) => e.unitId === id).map((e) => e.amountPenCents));
      return { name: houseOf(id), inc, exp };
    })
    .sort((a, b) => b.inc - b.exp - (a.inc - a.exp) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((h) => [h.name, h.inc, h.exp, h.inc - h.exp]);

  const money = (header: string, sum = false): Column => ({ header, kind: "money", width: 16, sum });
  const text = (header: string, width: number): Column => ({ header, kind: "text", width });
  const date = (header: string): Column => ({ header, kind: "date", width: 12 });

  const summary: Sheet = {
    name: "Resumen",
    notes: [
      `Propiedad: ${input.propertyName}`,
      `Período: ${dmy(period.from)} al ${dmy(lastDay)}`,
      "Base de cálculo: por cobro (cada movimiento cuenta el día en que se cobró o pagó). La hoja de rendimiento es por estadía.",
      "Montos en soles (PEN). Los movimientos en dólares están convertidos al tipo de cambio registrado.",
      "Por alquiler: los costos ligados (comisión, limpieza, otros) cuentan aunque estén fechados fuera del período, por eso pueden no coincidir con la hoja Egresos.",
      "Rendimiento: las noches se suman, pero la ocupación no (se calcula por mes y por casa).",
      `Generado el ${dmy(todayInLima(input.now))}`,
    ],
    filter: false,
    blocks: [
      { title: "Resumen por mes", columns: [text("Mes", 22), money("Ingresos", true), money("Egresos", true), money("Utilidad", true)], rows: monthRows, totals: true },
      { title: "Ingresos por categoría", columns: [text("Categoría", 30), money("Monto", true)], rows: byCategory(incomes), totals: true },
      { title: "Egresos por categoría", columns: [text("Categoría", 30), money("Monto", true)], rows: byCategory(expenses), totals: true },
      {
        title: "Resultado por casa",
        columns: [text("Casa", 30), money("Ingresos", true), money("Egresos", true), money("Utilidad", true)],
        rows: houseRows,
        totals: true,
      },
    ],
  };

  // ── Ingresos / Egresos ──
  const relatedText = (e: ExportEntry): string | null => {
    const rental = e.relatedEntryId === null ? undefined : byId.get(e.relatedEntryId);
    if (rental === undefined) return null;
    const stay = rental.stayStart !== null && rental.stayEnd !== null ? ` ${dmy(rental.stayStart)}–${dmy(rental.stayEnd)}` : "";
    return `${houseOf(rental.unitId)}${stay}${rental.counterparty ? ` (${rental.counterparty})` : ""}`;
  };
  const common = (e: ExportEntry) => [
    e.currency,
    e.amountCents,
    e.fxRatePen,
    e.amountPenCents,
    e.paymentMethod === null ? null : PAYMENT_METHOD_LABELS[e.paymentMethod],
  ];
  const moneyCols = [text("Moneda", 9), { header: "Monto original", kind: "money" as const, width: 16 }, { header: "Tipo de cambio", kind: "rate" as const, width: 14 }, money("Monto PEN", true), text("Medio de pago", 16)];

  const incomeSheet: Sheet = {
    name: "Ingresos",
    notes: [],
    filter: true,
    blocks: [
      {
        columns: [date("Fecha"), text("Categoría", 24), text("Casa", 22), text("Canal", 12), text("Cliente", 24), date("Entrada"), date("Salida"), ...moneyCols, text("Comprobante", 13), text("Nota", 40)],
        rows: incomes.map((e) => [e.occurredOn, nameOf(e.categoryId), houseOf(e.unitId), channelLabel(e.channel), e.counterparty, e.stayStart, e.stayEnd, ...common(e), e.hasReceipt ? "Sí" : "No", e.note]),
        totals: true,
      },
    ],
  };
  const expenseSheet: Sheet = {
    name: "Egresos",
    notes: [],
    filter: true,
    blocks: [
      {
        columns: [date("Fecha"), text("Categoría", 24), text("Casa", 22), text("Proveedor", 24), ...moneyCols, text("Alquiler relacionado", 36), text("Comprobante", 13), text("Nota", 40)],
        rows: expenses.map((e) => [e.occurredOn, nameOf(e.categoryId), houseOf(e.unitId), e.counterparty, ...common(e), relatedText(e), e.hasReceipt ? "Sí" : "No", e.note]),
        totals: true,
      },
    ],
  };

  // ── Rendimiento (por estadía) ──
  const perfRows: CellValue[][] = [];
  // One pass groups the slices by month, so each slice is read once however many
  // months the range has (a ledger with very long stays must not multiply the work
  // by the number of months). Availability does not depend on these lists.
  const pr = prepared.prepared;
  const monthly = {
    stay: groupByMonth(pr.stay.filter((s) => inPeriod(s.date, period))),
    nights: groupByMonth(pr.nights.filter((n) => inPeriod(n.date, period))),
  };
  for (const m of months) {
    const report = periodReport({ ...pr, cash: [], stay: monthly.stay.get(m) ?? [], nights: monthly.nights.get(m) ?? [] }, clip(m, period), "stay");
    for (const u of report.units) {
      if (u.availableNights === 0 && u.bookedNights === 0 && u.incomeCents === 0 && u.expenseCents === 0) continue;
      perfRows.push([monthLabel(m), u.name, u.bookedNights, u.availableNights, u.occupancyBps, u.adrCents, u.revparCents, u.rentals, u.incomeCents, u.expenseCents, u.netCents]);
    }
    const g = report.general;
    if (g.incomeCents !== 0 || g.expenseCents !== 0) perfRows.push([monthLabel(m), "General (sin casa)", null, null, null, null, null, null, g.incomeCents, g.expenseCents, g.netCents]);
  }
  const int = (header: string, sum = false): Column => ({ header, kind: "int", width: 14, sum });
  const performance: Sheet = {
    name: "Rendimiento (por estadía)",
    notes: [],
    filter: false,
    blocks: [
      {
        columns: [
          text("Mes", 18), text("Casa", 24), int("Noches reservadas", true), int("Noches disponibles", true),
          { header: "Ocupación", kind: "percent", width: 12 }, money("Tarifa promedio por noche"), money("Ingreso por noche disponible"),
          int("Alquileres con noches en el mes"), money("Ingresos", true), money("Egresos", true), money("Utilidad", true),
        ],
        rows: perfRows,
        totals: true,
      },
    ],
  };

  // ── Por alquiler (por cobro) ──
  const costsByRental = new Map<string, ExportEntry[]>();
  for (const e of input.entries) {
    if (e.kind === "expense" && e.relatedEntryId !== null) costsByRental.set(e.relatedEntryId, [...(costsByRental.get(e.relatedEntryId) ?? []), e]);
  }
  const rentalRows: CellValue[][] = [];
  for (const e of incomes) {
    if (e.stayStart === null || e.stayEnd === null) continue;
    const costs = costsByRental.get(e.id) ?? [];
    const sumOf = (rows: ExportEntry[]) => total(rows.map((c) => c.amountPenCents));
    const commission = sumOf(costs.filter((c) => categoryKey.get(c.categoryId) === "platform_commission"));
    const cleaning = sumOf(costs.filter((c) => categoryKey.get(c.categoryId) === "cleaning"));
    const other = sumOf(costs.filter((c) => !["platform_commission", "cleaning"].includes(categoryKey.get(c.categoryId) ?? "")));
    rentalRows.push([
      e.occurredOn, houseOf(e.unitId), channelLabel(e.channel), e.counterparty, e.stayStart, e.stayEnd,
      daysBetween(e.stayStart, e.stayEnd),
      e.amountPenCents, commission, cleaning, other, e.amountPenCents - commission - cleaning - other,
    ]);
  }
  const perRental: Sheet = {
    name: "Por alquiler",
    notes: [],
    filter: true,
    blocks: [
      {
        columns: [
          date("Cobro"), text("Casa", 22), text("Canal", 12), text("Cliente", 24), date("Entrada"), date("Salida"), int("Noches", true),
          money("Ingreso", true), money("Comisión de plataforma", true), money("Limpieza", true), money("Otros costos ligados", true), money("Utilidad del alquiler", true),
        ],
        rows: rentalRows,
        totals: true,
      },
    ],
  };

  return { ok: true, model: { sheets: [summary, incomeSheet, expenseSheet, performance, perRental] } };
}
