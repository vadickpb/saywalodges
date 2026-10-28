import { describe, it, expect } from "vitest";
import {
  MAX_EXPORT_DAYS,
  buildExportModel,
  parseExportPeriod,
  type ExportCategory,
  type ExportEntry,
  type ExportModel,
} from "./finance-export";
import type { ReportUnit } from "./finance-reports";

const categories: ExportCategory[] = [
  { id: "c-rental", name: "Alquiler", systemKey: "rental" },
  { id: "c-other", name: "Otros ingresos", systemKey: "other_income" },
  { id: "c-comm", name: "Comisiones de plataforma", systemKey: "platform_commission" },
  { id: "c-clean", name: "Limpieza", systemKey: "cleaning" },
  { id: "c-water", name: "Agua", systemKey: "water" },
  { id: "c-own", name: "Jardinero", systemKey: null },
];
const units: ReportUnit[] = [{ id: "u1", name: "Casa A", active: true, availableFrom: "2027-01-01" }];

const entry = (over: Partial<ExportEntry> & Pick<ExportEntry, "id" | "kind" | "categoryId" | "occurredOn" | "amountPenCents">): ExportEntry => ({
  amountCents: over.amountPenCents,
  currency: "PEN",
  fxRatePen: null,
  unitId: null,
  paymentMethod: "cash",
  counterparty: null,
  note: null,
  stayStart: null,
  stayEnd: null,
  channel: null,
  relatedEntryId: null,
  hasReceipt: false,
  ...over,
});

// March 2027, hand-computed: income 100000 + 37550 = 137550; expenses 15000 + 8000 + 4550 = 27550.
const ledger: ExportEntry[] = [
  entry({ id: "r1", kind: "income", categoryId: "c-rental", occurredOn: "2027-03-05", amountPenCents: 100000, unitId: "u1", stayStart: "2027-03-05", stayEnd: "2027-03-08", channel: "airbnb", counterparty: "Ana", paymentMethod: "bank_transfer", hasReceipt: true }),
  entry({ id: "k1", kind: "expense", categoryId: "c-comm", occurredOn: "2027-03-05", amountPenCents: 15000, unitId: "u1", relatedEntryId: "r1" }),
  entry({ id: "k2", kind: "expense", categoryId: "c-clean", occurredOn: "2027-03-08", amountPenCents: 8000, unitId: "u1", relatedEntryId: "r1" }),
  entry({ id: "w1", kind: "expense", categoryId: "c-water", occurredOn: "2027-03-10", amountPenCents: 4550, counterparty: "Sedapal", note: "=1+1" }),
  entry({ id: "d1", kind: "income", categoryId: "c-other", occurredOn: "2027-03-20", amountPenCents: 37550, amountCents: 10000, currency: "USD", fxRatePen: 3.755 }),
  entry({ id: "old", kind: "expense", categoryId: "c-water", occurredOn: "2027-02-27", amountPenCents: 3000 }),
  entry({ id: "new", kind: "income", categoryId: "c-other", occurredOn: "2027-04-02", amountPenCents: 5000 }),
];
const march = { from: "2027-03-01", toExclusive: "2027-04-01" };

function model(period = march, entries = ledger): ExportModel {
  const r = buildExportModel({ entries, categories, units, period, propertyName: "Saywa Lodges", now: new Date("2027-04-03T15:00:00Z") });
  if (!r.ok) throw new Error(r.error);
  return r.model;
}
const sheet = (m: ExportModel, name: string) => {
  const s = m.sheets.find((x) => x.name === name);
  if (!s) throw new Error(`no sheet ${name}`);
  return s;
};

describe("parseExportPeriod", () => {
  it("reads a month, a year or an inclusive range", () => {
    expect(parseExportPeriod({ month: "2027-03" })).toEqual({ period: march, slug: "2027-03" });
    expect(parseExportPeriod({ year: "2027" })).toEqual({ period: { from: "2027-01-01", toExclusive: "2028-01-01" }, slug: "2027" });
    expect(parseExportPeriod({ from: "2027-03-15", to: "2027-03-31" })).toEqual({
      period: { from: "2027-03-15", toExclusive: "2027-04-01" },
      slug: "2027-03-15_2027-03-31",
    });
    expect(parseExportPeriod({ month: ["2027-03", "x"] })?.slug).toBe("2027-03");
  });

  it("rejects anything invalid instead of guessing", () => {
    for (const bad of [
      {}, { month: "2027-13" }, { month: "garbage" }, { year: "99" }, { year: "1999" }, { year: "2101" }, { year: "20x7" },
      { from: "2027-03-01" }, { to: "2027-03-01" }, { from: "2027-02-30", to: "2027-03-01" }, { from: "2027-03-02", to: "2027-03-01" },
      { from: "0000-01-01", to: "2027-03-01" },
    ]) {
      expect(parseExportPeriod(bad)).toBeNull();
    }
  });

  it("caps the range length", () => {
    expect(MAX_EXPORT_DAYS).toBe(1830);
    expect(parseExportPeriod({ from: "2027-01-01", to: "2031-12-30" })).not.toBeNull(); // 1824 days
    expect(parseExportPeriod({ from: "2020-01-01", to: "2027-03-01" })).toBeNull();
  });
});

describe("buildExportModel", () => {
  it("has the five sheets, the basis stated in the name of the performance one", () => {
    expect(model().sheets.map((s) => s.name)).toEqual(["Resumen", "Ingresos", "Egresos", "Rendimiento (por estadía)", "Por alquiler"]);
  });

  it("summarises by cash: month, category and house", () => {
    const s = sheet(model(), "Resumen");
    expect(s.notes[0]).toBe("Propiedad: Saywa Lodges");
    expect(s.notes[1]).toBe("Período: 01/03/2027 al 31/03/2027");
    expect(s.notes[2]).toContain("por cobro");
    expect(s.notes[4]).toContain("fuera del período");
    expect(s.notes[5]).toContain("la ocupación no");
    expect(s.notes[6]).toBe("Generado el 03/04/2027");
    const [months, incomeBy, expenseBy, houses] = s.blocks;
    expect(months.rows).toEqual([["marzo 2027", 137550, 27550, 110000]]);
    expect(incomeBy.rows).toEqual([["Alquiler", 100000], ["Otros ingresos", 37550]]);
    expect(expenseBy.rows).toEqual([["Comisiones de plataforma", 15000], ["Limpieza", 8000], ["Agua", 4550]]);
    expect(houses.rows).toEqual([["Casa A", 100000, 23000, 77000], ["General (sin casa)", 37550, 4550, 33000]]);
    expect(months.totals && incomeBy.totals && expenseBy.totals && houses.totals).toBe(true);
  });

  it("lists only the entries inside the period, ordered by date, with the original currency and the PEN figure", () => {
    const m = model();
    const income = sheet(m, "Ingresos").blocks[0];
    expect(income.rows.map((r) => r[0])).toEqual(["2027-03-05", "2027-03-20"]);
    expect(income.rows[0]).toEqual(["2027-03-05", "Alquiler", "Casa A", "Airbnb", "Ana", "2027-03-05", "2027-03-08", "PEN", 100000, null, 100000, "Transferencia", "Sí", null]);
    expect(income.rows[1]).toEqual(["2027-03-20", "Otros ingresos", "General (sin casa)", null, null, null, null, "USD", 10000, 3.755, 37550, "Efectivo", "No", null]);
    const expense = sheet(m, "Egresos").blocks[0];
    expect(expense.rows.map((r) => r[0])).toEqual(["2027-03-05", "2027-03-08", "2027-03-10"]);
    expect(expense.rows[0][9]).toBe("Casa A 05/03/2027–08/03/2027 (Ana)");
    expect(expense.rows[2]).toEqual(["2027-03-10", "Agua", "General (sin casa)", "Sedapal", "PEN", 4550, null, 4550, "Efectivo", null, "No", "=1+1"]);
    const pen = (b: typeof income, col: number) => b.columns[col].header + ":" + b.columns[col].sum;
    expect(pen(income, 10)).toBe("Monto PEN:true");
    expect(pen(income, 8)).toBe("Monto original:undefined"); // never add soles to dollars
  });

  it("breaks each rental down into commission, cleaning, other costs and profit", () => {
    const rows = sheet(model(), "Por alquiler").blocks[0].rows;
    expect(rows).toEqual([["2027-03-05", "Casa A", "Airbnb", "Ana", "2027-03-05", "2027-03-08", 3, 100000, 15000, 8000, 0, 77000]]);
    // a cost dated after the period still belongs to its rental
    const late = model(march, [...ledger, entry({ id: "k9", kind: "expense", categoryId: "c-clean", occurredOn: "2027-04-09", amountPenCents: 1000, unitId: "u1", relatedEntryId: "r1" })]);
    expect(sheet(late, "Por alquiler").blocks[0].rows[0].slice(7)).toEqual([100000, 15000, 9000, 0, 76000]);
    expect(sheet(late, "Egresos").blocks[0].rows).toHaveLength(3);
    const withOther = model(march, [...ledger, entry({ id: "k3", kind: "expense", categoryId: "c-own", occurredOn: "2027-03-09", amountPenCents: 2500, unitId: "u1", relatedEntryId: "r1" })]);
    expect(sheet(withOther, "Por alquiler").blocks[0].rows[0].slice(7)).toEqual([100000, 15000, 8000, 2500, 74500]);
  });

  it("reports performance by stay: nights, occupancy and money per house and month", () => {
    const rows = sheet(model(), "Rendimiento (por estadía)").blocks[0].rows;
    // 3 booked of 31 available nights = 9.677 % -> 968 bps
    expect(rows[0].slice(0, 5)).toEqual(["marzo 2027", "Casa A", 3, 31, 968]);
    expect(rows[0].slice(8)).toEqual([100000, 23000, 77000]);
    expect(rows[1]).toEqual(["marzo 2027", "General (sin casa)", null, null, null, null, null, null, 37550, 4550, 33000]);
  });

  it("clips months to a custom range and keeps empty months visible in the summary", () => {
    const m = model({ from: "2027-02-15", toExclusive: "2027-04-01" });
    expect(sheet(m, "Resumen").blocks[0].rows).toEqual([["febrero 2027", 0, 3000, -3000], ["marzo 2027", 137550, 27550, 110000]]);
    const perf = sheet(m, "Rendimiento (por estadía)").blocks[0].rows;
    // 14 nights of February (15..28) are available to Casa A in that range
    expect(perf.find((r) => r[0] === "febrero 2027" && r[1] === "Casa A")?.slice(2, 4)).toEqual([0, 14]);
  });

  it("names unknown categories and houses instead of failing, and survives an empty period", () => {
    const odd = model(march, [entry({ id: "z", kind: "expense", categoryId: "gone", occurredOn: "2027-03-02", amountPenCents: 100, unitId: "deleted" })]);
    expect(sheet(odd, "Egresos").blocks[0].rows[0].slice(1, 3)).toEqual(["Sin categoría", "Casa eliminada"]);
    const empty = model(march, []);
    expect(sheet(empty, "Ingresos").blocks[0].rows).toEqual([]);
    expect(sheet(empty, "Resumen").blocks[0].rows).toEqual([["marzo 2027", 0, 0, 0]]);
  });

  it("returns the engine's error for bad data (amounts or sums it cannot add exactly)", () => {
    const bad = buildExportModel({ entries: [entry({ id: "n", kind: "income", categoryId: "c-other", occurredOn: "2027-03-02", amountPenCents: -5 })], categories, units, period: march, propertyName: "", now: new Date() });
    expect(bad).toEqual({ ok: false, error: "INVALID_AMOUNT" });
    const big = buildExportModel({
      entries: [0, 1, 2, 3, 4].map((i) => entry({ id: `h${i}`, kind: "income", categoryId: "c-other", occurredOn: "2027-03-02", amountPenCents: Math.floor(Number.MAX_SAFE_INTEGER / 4) })),
      categories, units, period: march, propertyName: "", now: new Date(),
    });
    expect(big).toEqual({ ok: false, error: "AMOUNT_OVERFLOW" });
  });

  it("orders ties by id and by name, and handles gaps in the data", () => {
    const extra: ExportEntry[] = [
      entry({ id: "b2", kind: "expense", categoryId: "c-water", occurredOn: "2027-03-10", amountPenCents: 4550, paymentMethod: null }),
      // two categories with the same total: alphabetical order
      entry({ id: "g1", kind: "expense", categoryId: "c-own", occurredOn: "2027-03-11", amountPenCents: 8200 }),
      // two houses with the same result: alphabetical order
      entry({ id: "i1", kind: "income", categoryId: "c-other", occurredOn: "2027-03-12", amountPenCents: 500, unitId: "u2" }),
      entry({ id: "i2", kind: "income", categoryId: "c-other", occurredOn: "2027-03-12", amountPenCents: 500, unitId: "u3" }),
      // linked to a rental that is not in the ledger / to an income that is not a rental (no stay, no client)
      entry({ id: "o1", kind: "expense", categoryId: "c-clean", occurredOn: "2027-03-13", amountPenCents: 100, relatedEntryId: "missing" }),
      entry({ id: "o2", kind: "expense", categoryId: "c-clean", occurredOn: "2027-03-13", amountPenCents: 100, relatedEntryId: "d1" }),
      // a rental with no linked costs
      entry({ id: "r2", kind: "income", categoryId: "c-rental", occurredOn: "2027-03-15", amountPenCents: 20000, unitId: "u1", stayStart: "2027-03-15", stayEnd: "2027-03-17" }),
    ];
    const more: ReportUnit[] = [
      ...units,
      { id: "u2", name: "Casa B", active: true, availableFrom: "2027-01-01" },
      { id: "u3", name: "Casa C", active: true, availableFrom: "2027-01-01" },
      { id: "u4", name: "Casa D", active: false, availableFrom: "2027-01-01", availableUntil: "2027-01-02" },
    ];
    const r = buildExportModel({ entries: [...ledger, ...extra], categories, units: more, period: march, propertyName: "", now: new Date("2027-04-03T15:00:00Z") });
    if (!r.ok) throw new Error(r.error);
    const m = r.model;
    const expenses = sheet(m, "Egresos").blocks[0].rows;
    expect(expenses.map((e) => e[0])).toEqual(["2027-03-05", "2027-03-08", "2027-03-10", "2027-03-10", "2027-03-11", "2027-03-13", "2027-03-13"]);
    expect(expenses[2][3]).toBeNull(); // b2 sorts before w1 on the same day
    expect(expenses[2][8]).toBeNull(); // payment method not recorded
    expect(expenses[5][9]).toBeNull(); // related rental not found
    expect(expenses[6][9]).toBe("General (sin casa)"); // related income without stay or client
    const expenseBy = sheet(m, "Resumen").blocks[2].rows;
    expect(expenseBy.map((x) => x[0])).toEqual(["Comisiones de plataforma", "Agua", "Jardinero", "Limpieza"]);
    const houses = sheet(m, "Resumen").blocks[3].rows.map((x) => x[0]);
    expect(houses.slice(0, 2)).toEqual(["Casa A", "General (sin casa)"]);
    expect(houses.slice(2)).toEqual(["Casa B", "Casa C"]);
    const rentals = sheet(m, "Por alquiler").blocks[0].rows;
    expect(rentals[1]).toEqual(["2027-03-15", "Casa A", null, null, "2027-03-15", "2027-03-17", 2, 20000, 0, 0, 0, 20000]);
    // a house that never operated in the period has no row in the performance sheet
    expect(sheet(m, "Rendimiento (por estadía)").blocks[0].rows.some((row) => row[1] === "Casa D")).toBe(false);
  });
});
