import { describe, expect, it } from "vitest";
import { UNITS_TEMPLATE_CSV, parseUnitsCsv } from "./units-import";

describe("parseUnitsCsv", () => {
  it("reads the downloadable template", () => {
    const parsed = parseUnitsCsv(UNITS_TEMPLATE_CSV);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({ name: "Casa completa", kind: "entire_place", max_guests: 6, included_guests: 4, nightly_cents: 35000, weekend_nightly_cents: 42000, extra_guest_cents: 4000, min_nights: 2 });
    expect(parsed.rows[1]).toMatchObject({ kind: "room", included_guests: 2, weekend_nightly_cents: null, extra_guest_cents: 0, min_nights: 1 });
  });
  it("accepts semicolons and decimal commas", () => {
    const parsed = parseUnitsCsv("nombre;tipo;huespedes_maximo;precio_noche\nCasa;casa;4;150,50\n");
    expect(parsed.ok && parsed.rows[0].nightly_cents).toBe(15050);
    expect(parsed.ok && parsed.rows[0].included_guests).toBe(4);
  });
  it("fails clearly when a required column is missing", () => {
    const parsed = parseUnitsCsv("nombre,tipo\nCasa,casa\n");
    expect(parsed).toEqual({ ok: false, error: expect.stringContaining("huespedes_maximo") });
  });
  it("skips bad rows with a reason and keeps the good ones", () => {
    const parsed = parseUnitsCsv("nombre,tipo,huespedes_maximo,huespedes_incluidos,precio_noche\nA,casa,4,5,100\nB,mansion,4,4,100\nC,casa,4,4,0\nD,casa,4,4,100\nd,casa,4,4,120\n");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows.map((r) => r.name)).toEqual(["D"]);
    expect(parsed.skipped.map((s) => s.line)).toEqual([2, 3, 4, 6]);
  });
  it("rejects an empty or invalid file", () => {
    expect(parseUnitsCsv("nombre,tipo,huespedes_maximo,precio_noche\n").ok).toBe(false);
    expect(parseUnitsCsv("nombre,tipo,huespedes_maximo,precio_noche\nX,casa,0,100\n").ok).toBe(false);
  });
});
