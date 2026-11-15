import { describe, expect, it } from "vitest";
import { FINANCE_CSV_TEMPLATE, parseFinanceCsv, parseFinanceDate } from "./finance-csv-import";

const TODAY = "2026-11-15";
const UNITS = { "Casa 1": "11111111-1111-4111-8111-111111111111" };

describe("parseFinanceDate", () => {
  it("accepts ISO and Peruvian D/M/YYYY, rejects impossible dates", () => {
    expect(parseFinanceDate("2026-03-05")).toBe("2026-03-05");
    expect(parseFinanceDate("5/3/2026")).toBe("2026-03-05");
    expect(parseFinanceDate("31/02/2026")).toBeNull();
    expect(parseFinanceDate("hoy")).toBeNull();
  });
});

describe("parseFinanceCsv", () => {
  it("parses the downloadable template", () => {
    const r = parseFinanceCsv(FINANCE_CSV_TEMPLATE, TODAY, UNITS);
    expect(r.ok && r.rows.length).toBe(2);
    if (r.ok) {
      expect(r.rows[0]).toMatchObject({ kind: "expense", category: "Limpieza", amount_cents: 8000, currency: "PEN", payment_method: "cash" });
      expect(r.rows[1]).toMatchObject({ kind: "income", payment_method: "yape_plin" });
      expect(r.totals.PEN).toEqual({ income: 4000, expense: 8000 });
      expect(r.needsFxRate).toBe(false);
    }
  });

  it("works with semicolons, accents in headers and a BOM", () => {
    const r = parseFinanceCsv("﻿Fecha;Tipo;Categoría;Monto\n05/03/2026;Gasto;Luz;1234,50\n", TODAY, {});
    expect(r.ok && r.rows[0]).toMatchObject({ occurred_on: "2026-03-05", amount_cents: 123450, category: "Luz" });
  });

  it("fails clearly when required columns are missing", () => {
    expect(parseFinanceCsv("fecha,monto\n2026-01-01,10\n", TODAY, {})).toEqual({ ok: false, error: "Faltan columnas: tipo." });
  });

  it("skips bad rows with a reason and keeps the good ones", () => {
    const csv = "fecha,tipo,monto,moneda,casa,metodo\n2026-01-01,gasto,10,PEN,,\n2027-01-01,gasto,10,PEN,,\n2026-01-02,raro,10,PEN,,\n2026-01-03,gasto,0,PEN,,\n2026-01-04,gasto,5,EUR,,\n2026-01-05,gasto,5,PEN,Casa 9,\n2026-01-06,gasto,5,PEN,,bitcoin\n";
    const r = parseFinanceCsv(csv, TODAY, UNITS);
    expect(r.ok && r.rows.length).toBe(1);
    if (r.ok) expect(r.skipped.map((s) => s.line)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it("maps a known house and flags USD rows as needing an exchange rate", () => {
    const r = parseFinanceCsv("fecha,tipo,monto,moneda,casa\n2026-01-01,ingreso,10,USD,casa 1\n", TODAY, UNITS);
    expect(r.ok && r.rows[0].unit_id).toBe(UNITS["Casa 1"]);
    expect(r.ok && r.needsFxRate).toBe(true);
  });

  it("gives stable refs: same file same refs; identical rows in one file differ", () => {
    const csv = "fecha,tipo,monto\n2026-01-01,gasto,10\n2026-01-01,gasto,10\n";
    const a = parseFinanceCsv(csv, TODAY, {});
    const b = parseFinanceCsv(csv, TODAY, {});
    expect(a.ok && b.ok && a.rows.map((x) => x.ref)).toEqual(b.ok ? b.rows.map((x) => x.ref) : []);
    expect(a.ok && a.rows[0].ref).not.toBe(a.ok && a.rows[1].ref);
    expect(a.ok && a.rows[0].ref).toMatch(/^[0-9a-f]{32}$/);
  });
});
