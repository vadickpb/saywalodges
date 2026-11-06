import { describe, expect, it } from "vitest";
import { parseAirbnbCsv, parseAirbnbDate, parseAirbnbMoney, parseCsv, toImportRows } from "./airbnb-import";

const HEADER = "Fecha,Fecha de llegada estimada,Tipo,Código de confirmación,Fecha de la reservación,Fecha de inicio,Fecha de finalización,Noches,Huésped,Espacio,Detalles,Código de referencia,Moneda,Monto,Ingresos recibidos,Tarifa de servicio,Tarifa por Pago rápido,Tarifa de limpieza,Ingresos brutos,Impuesto liquidado por Airbnb,Año de ingresos";
const PAYOUT = "11/1/2026,11/6/2026,Payout,,,,,,,,Transferir a Alguien,0MS1NpsiYloVqKlYih4ZUITjUD9,PEN,1366.21,,,,,,,";
const RES = '10/20/2026,,Reservación,HMABC12345,10/1/2026,10/10/2026,10/13/2026,3,"Pérez, Ana",Casa Saywa,,,PEN,850.00,850.00,-150.00,0,50.00,1000.00,0,2026';

describe("airbnb csv parsing", () => {
  it("handles quotes, BOM and semicolons", () => {
    expect(parseCsv('﻿a;b\r\n"x;1";"y ""z"""\r\n')).toEqual([["a", "b"], ["x;1", 'y "z"']]);
  });
  it("parses M/D/YYYY and rejects impossible dates", () => {
    expect(parseAirbnbDate("11/1/2026")).toBe("2026-11-01");
    expect(parseAirbnbDate("13/1/2026")).toBeNull();
    expect(parseAirbnbDate("2/30/2026")).toBeNull();
  });
  it("converts amounts to cents", () => {
    expect(parseAirbnbMoney("1,366.21")).toBe(136621);
    expect(parseAirbnbMoney("1366,5")).toBe(136650);
    expect(parseAirbnbMoney("-150.00")).toBe(-15000);
    expect(parseAirbnbMoney("")).toBe(0);
    expect(parseAirbnbMoney("abc")).toBeNull();
  });
  it("imports reservations, ignores payouts as income", () => {
    const r = parseAirbnbCsv([HEADER, PAYOUT, RES].join("\n"));
    if (!r.ok) throw new Error(r.error);
    expect(r.payouts).toEqual({ count: 1, totalCents: { PEN: 136621 } });
    expect(r.reservations).toEqual([expect.objectContaining({
      ref: "HMABC12345", guest: "Pérez, Ana", space: "Casa Saywa", stayStart: "2026-10-10", stayEnd: "2026-10-13",
      occurredOn: "2026-10-20", currency: "PEN", grossCents: 100000, feeCents: 15000,
    })]);
    expect(r.spaces).toEqual(["Casa Saywa"]);
  });
  it("skips refunds, repeated codes and unknown types without importing them", () => {
    const refund = RES.replace("1000.00", "-100.00");
    const r = parseAirbnbCsv([HEADER, RES, RES, refund.replace("HMABC12345", "HMXYZ98765"), "10/1/2026,,Ajuste,,,,,,,,,,PEN,5,,,,,,,"].join("\n"));
    if (!r.ok) throw new Error(r.error);
    expect(r.reservations).toHaveLength(1);
    expect(r.skipped.map((s) => s.line)).toEqual([3, 4, 5]);
  });
  it("names missing columns and enforces limits", () => {
    expect(parseAirbnbCsv("a,b\n1,2")).toEqual({ ok: false, error: expect.stringContaining("Faltan columnas") });
    expect(parseAirbnbCsv("x".repeat(2 * 1024 * 1024 + 1))).toEqual({ ok: false, error: "El archivo supera 2 MB." });
  });
  it("maps spaces to units for the RPC and reports unmapped ones", () => {
    const r = parseAirbnbCsv([HEADER, RES].join("\n"));
    if (!r.ok) throw new Error(r.error);
    expect(toImportRows(r.reservations, {}).unmapped).toHaveLength(1);
    const mapped = toImportRows(r.reservations, { "Casa Saywa": "11111111-1111-4111-8111-111111111111" });
    expect(mapped.rows[0]).toMatchObject({ ref: "HMABC12345", unit_id: "11111111-1111-4111-8111-111111111111", gross_cents: 100000, fee_cents: 15000 });
  });
});
