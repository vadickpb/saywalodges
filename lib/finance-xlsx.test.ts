import { describe, it, expect, vi } from "vitest";
import ExcelJS from "exceljs";

vi.mock("server-only", () => ({}));
import { buildExportModel, type ExportEntry } from "@/lib/domain/finance-export";
import { renderWorkbook } from "./finance-xlsx";

const base = {
  currency: "PEN" as const, fxRatePen: null, unitId: null, paymentMethod: "cash" as const, counterparty: null, note: null,
  stayStart: null, stayEnd: null, channel: null, relatedEntryId: null, hasReceipt: false,
};
const entries: ExportEntry[] = [
  { ...base, id: "r1", kind: "income", categoryId: "c1", occurredOn: "2027-03-05", amountCents: 100000, amountPenCents: 100000, unitId: "u1", stayStart: "2027-03-05", stayEnd: "2027-03-08", channel: "airbnb", counterparty: "Ana" },
  { ...base, id: "d1", kind: "income", categoryId: "c1", occurredOn: "2027-03-20", amountCents: 10000, amountPenCents: 37550, currency: "USD", fxRatePen: 3.755 },
  { ...base, id: "w1", kind: "expense", categoryId: "c2", occurredOn: "2027-03-10", amountCents: 4550, amountPenCents: 4550, note: "=HYPERLINK(\"http://evil\")" },
];

async function load() {
  const result = buildExportModel({
    entries,
    categories: [{ id: "c1", name: "Alquiler", systemKey: "rental" }, { id: "c2", name: "Agua", systemKey: "water" }],
    units: [{ id: "u1", name: "Casa A", active: true, availableFrom: "2027-01-01" }],
    period: { from: "2027-03-01", toExclusive: "2027-04-01" },
    propertyName: "Saywa Lodges",
    now: new Date("2027-04-03T15:00:00Z"),
  });
  if (!result.ok) throw new Error(result.error);
  const buffer = await renderWorkbook(result.model);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return { wb, buffer };
}

describe("renderWorkbook", () => {
  it("writes a real xlsx with the five sheets", async () => {
    const { wb, buffer } = await load();
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Ingresos", "Egresos", "Rendimiento (por estadía)", "Por alquiler"]);
  });

  it("stores dates as dates and money as numbers in soles", async () => {
    const ws = (await load()).wb.getWorksheet("Ingresos")!;
    expect(ws.getRow(1).getCell(1).value).toBe("Fecha");
    const date = ws.getRow(2).getCell(1);
    expect(date.value).toBeInstanceOf(Date);
    expect((date.value as Date).toISOString()).toBe("2027-03-05T00:00:00.000Z");
    expect(date.numFmt).toBe("dd/mm/yyyy");
    const original = ws.getRow(3).getCell(9); // USD 100.00
    expect(original.value).toBe(100);
    expect(original.numFmt).toBe("#,##0.00");
    expect(ws.getRow(3).getCell(10).value).toBe(3.755);
    const pen = ws.getRow(3).getCell(11);
    expect(pen.value).toBe(375.5);
    expect(typeof pen.value).toBe("number");
  });

  it("totals with SUM formulas that carry their value", async () => {
    const ws = (await load()).wb.getWorksheet("Ingresos")!;
    expect(ws.getRow(4).getCell(1).value).toBe("Total");
    const cell = ws.getRow(4).getCell(11).value as { formula: string; result: number };
    expect(cell.formula).toBe("SUM(K2:K3)");
    expect(cell.result).toBe(1375.5);
    expect(ws.getRow(4).getCell(9).value).toBeNull(); // original amounts mix currencies: not added
  });

  it("freezes the header and filters the data, but not the totals row", async () => {
    const ws = (await load()).wb.getWorksheet("Egresos")!;
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    // header + the single expense; the totals row (3) stays outside the filter
    expect(ws.autoFilter).toBe("A1:L2");
    expect(ws.getRow(3).getCell(1).value).toBe("Total");
  });

  it("never turns user text into a formula", async () => {
    const ws = (await load()).wb.getWorksheet("Egresos")!;
    const note = ws.getRow(2).getCell(12).value;
    expect(note).toBe('=HYPERLINK("http://evil")');
    expect(typeof note).toBe("string");
  });

  it("lays out the summary with notes first and one table after another", async () => {
    const ws = (await load()).wb.getWorksheet("Resumen")!;
    expect(ws.getRow(1).getCell(1).value).toBe("Propiedad: Saywa Lodges");
    expect((ws.views ?? []).some((v) => v.state === "frozen")).toBe(false);
    const rows: unknown[] = [];
    ws.eachRow((row) => rows.push(row.getCell(1).value));
    expect(rows).toEqual(expect.arrayContaining(["Resumen por mes", "marzo 2027", "Ingresos por categoría", "Egresos por categoría", "Resultado por casa", "Total"]));
  });

  it("shows occupancy as a percentage and writes a zero total for an empty table", async () => {
    const { wb } = await load();
    const perf = wb.getWorksheet("Rendimiento (por estadía)")!;
    const occupancy = perf.getRow(2).getCell(5);
    expect(occupancy.numFmt).toBe("0.0%");
    expect(occupancy.value).toBeCloseTo(0.0968, 4);
    const empty = buildExportModel({ entries: [], categories: [], units: [], period: { from: "2027-03-01", toExclusive: "2027-04-01" }, propertyName: "", now: new Date() });
    if (!empty.ok) throw new Error("unexpected");
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load((await renderWorkbook(empty.model)) as unknown as ArrayBuffer);
    expect(wb2.getWorksheet("Ingresos")!.getRow(2).getCell(11).value).toBe(0);
  });
});
