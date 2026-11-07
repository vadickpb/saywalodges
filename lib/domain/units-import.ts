import { parseAirbnbMoney, parseCsv } from "./airbnb-import";

// SD-420: reads the "casas y tarifas" CSV (one row per house or room, with its base nightly rate). Pure, no I/O.
// Money is typed in the property's currency as plain amounts ("150" or "150.50"); the server stores cents.

export const MAX_UNITS_CSV_BYTES = 256 * 1024;
export const MAX_UNITS_ROWS = 200;

export const UNITS_TEMPLATE_HEADER = ["nombre", "tipo", "huespedes_maximo", "huespedes_incluidos", "precio_noche", "precio_fin_de_semana", "precio_huesped_extra", "noches_minimas"];
export const UNITS_TEMPLATE_CSV = `${UNITS_TEMPLATE_HEADER.join(",")}\nCasa completa,casa,6,4,350,420,40,2\nHabitación 1,habitacion,2,2,120,,,1\n`;

const ALIASES = {
  name: ["nombre", "casa", "unidad", "name"],
  kind: ["tipo", "kind", "type"],
  maxGuests: ["huespedes_maximo", "huespedes maximo", "capacidad", "max guests"],
  includedGuests: ["huespedes_incluidos", "huespedes incluidos", "incluidos", "included guests"],
  nightly: ["precio_noche", "precio noche", "tarifa", "nightly"],
  weekend: ["precio_fin_de_semana", "precio fin de semana", "fin de semana", "weekend"],
  extraGuest: ["precio_huesped_extra", "precio huesped extra", "huesped extra", "extra guest"],
  minNights: ["noches_minimas", "noches minimas", "minimo de noches", "min nights"],
} as const;
type Field = keyof typeof ALIASES;
const REQUIRED: Field[] = ["name", "kind", "maxGuests", "nightly"];

export type UnitImportRow = {
  name: string;
  kind: "entire_place" | "room";
  max_guests: number;
  included_guests: number;
  nightly_cents: number;
  weekend_nightly_cents: number | null;
  extra_guest_cents: number;
  min_nights: number;
};
export type UnitsParse =
  | { ok: true; rows: UnitImportRow[]; skipped: { line: number; reason: string }[] }
  | { ok: false; error: string };

function norm(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function kindOf(value: string): UnitImportRow["kind"] | null {
  const v = norm(value);
  if (/^(casa|casa completa|entire[_ ]?place|alojamiento completo|departamento|depa)$/.test(v)) return "entire_place";
  if (/^(habitacion|cuarto|room|dormitorio)$/.test(v)) return "room";
  return null;
}
function int(value: string, min: number, max: number): number | null {
  if (!/^\d{1,6}$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return n >= min && n <= max ? n : null;
}

export function parseUnitsCsv(text: string): UnitsParse {
  if (new TextEncoder().encode(text).length > MAX_UNITS_CSV_BYTES) return { ok: false, error: "El archivo es demasiado grande." };
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length < 2) return { ok: false, error: "El archivo no tiene filas." };
  const header = table[0].map(norm);
  const col = {} as Record<Field, number>;
  for (const field of Object.keys(ALIASES) as Field[]) {
    col[field] = header.findIndex((h) => (ALIASES[field] as readonly string[]).includes(h));
  }
  const missing = REQUIRED.filter((f) => col[f] < 0);
  if (missing.length > 0) return { ok: false, error: `Faltan columnas: ${missing.map((f) => ALIASES[f][0]).join(", ")}. Descarga la plantilla.` };
  if (table.length - 1 > MAX_UNITS_ROWS) return { ok: false, error: `Máximo ${MAX_UNITS_ROWS} filas.` };

  const rows: UnitImportRow[] = [];
  const skipped: { line: number; reason: string }[] = [];
  const seen = new Set<string>();
  const cell = (r: string[], f: Field) => (col[f] >= 0 ? (r[col[f]] ?? "").trim() : "");
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = cell(r, "name");
    const kind = kindOf(cell(r, "kind"));
    const maxGuests = int(cell(r, "maxGuests"), 1, 1000);
    const included = cell(r, "includedGuests") === "" ? maxGuests : int(cell(r, "includedGuests"), 1, 1000);
    const nightly = parseAirbnbMoney(cell(r, "nightly"));
    const weekendRaw = cell(r, "weekend");
    const weekend = weekendRaw === "" ? null : parseAirbnbMoney(weekendRaw);
    const extra = parseAirbnbMoney(cell(r, "extraGuest"));
    const min = cell(r, "minNights") === "" ? 1 : int(cell(r, "minNights"), 1, 365);
    const fail = (reason: string) => skipped.push({ line, reason });
    if (name === "" || name.length > 200) return fail("Nombre vacío o muy largo.");
    if (!kind) return fail("Tipo inválido: usa «casa» o «habitacion».");
    if (maxGuests === null) return fail("Huéspedes máximo inválido.");
    if (included === null || included > maxGuests) return fail("Huéspedes incluidos inválido (no puede superar el máximo).");
    if (nightly === null || nightly <= 0) return fail("Precio por noche inválido.");
    if (weekendRaw !== "" && (weekend === null || weekend < 0)) return fail("Precio de fin de semana inválido.");
    if (extra === null || extra < 0) return fail("Precio de huésped extra inválido.");
    if (min === null) return fail("Noches mínimas inválido.");
    const key = norm(name);
    if (seen.has(key)) return fail("Nombre repetido en el archivo.");
    seen.add(key);
    rows.push({ name, kind, max_guests: maxGuests, included_guests: included, nightly_cents: nightly, weekend_nightly_cents: weekend, extra_guest_cents: extra, min_nights: min });
  });
  if (rows.length === 0) return { ok: false, error: "Ninguna fila es válida. Revisa los avisos." };
  return { ok: true, rows, skipped };
}
