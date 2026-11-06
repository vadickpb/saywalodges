// SD-419: pure parser for the Airbnb "Ganancias" CSV (no I/O). Only `Reservation` rows become ledger
// entries; `Payout` rows are bank transfers of money already counted in their reservation (never income).
export const MAX_AIRBNB_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_AIRBNB_CSV_ROWS = 5000;

export type AirbnbReservation = {
  line: number;
  ref: string;
  space: string;
  guest: string;
  stayStart: string;
  stayEnd: string;
  occurredOn: string;
  currency: "PEN" | "USD";
  grossCents: number;
  feeCents: number;
};
export type AirbnbSkipped = { line: number; reason: string };
export type AirbnbParse =
  | { ok: false; error: string }
  | {
      ok: true;
      reservations: AirbnbReservation[];
      payouts: { count: number; totalCents: Record<string, number> };
      skipped: AirbnbSkipped[];
      spaces: string[];
    };

const FIELD_ALIASES = {
  date: ["fecha", "date"],
  type: ["tipo", "type"],
  code: ["codigo de confirmacion", "confirmation code"],
  start: ["fecha de inicio", "start date"],
  end: ["fecha de finalizacion", "end date"],
  guest: ["huesped", "guest"],
  space: ["espacio", "anuncio", "listing"],
  currency: ["moneda", "currency"],
  amount: ["monto", "amount"],
  serviceFee: ["tarifa de servicio", "service fee"],
  fastPayFee: ["tarifa por pago rapido", "fast pay fee"],
  gross: ["ingresos brutos", "gross earnings"],
} as const;
type Field = keyof typeof FIELD_ALIASES;
const REQUIRED: Field[] = ["type", "code", "start", "end", "currency", "gross"];

function normalizeHeader(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => firstLine.split(d).length);
  const delimiter = [",", ";", "\t"][counts.indexOf(Math.max(...counts))];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

/** M/D/YYYY (Airbnb) or YYYY-MM-DD → ISO date, or null when not a real calendar date. */
export function parseAirbnbDate(value: string): string | null {
  const v = value.trim();
  let y: number, m: number, d: number;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (us) { m = Number(us[1]); d = Number(us[2]); y = Number(us[3]); }
  else if (iso) { y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]); }
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "1,366.21" / "1366.21" / "-12.5" → integer cents; null if not a plain amount. Empty → 0. */
export function parseAirbnbMoney(value: string): number | null {
  let v = value.replace(/[\s$]|S\/|PEN|USD/gi, "");
  if (v === "") return 0;
  if (v.includes(",") && v.includes(".")) v = v.replace(/,/g, "");
  else if (v.includes(",")) v = /,\d{1,2}$/.test(v) ? v.replace(",", ".") : v.replace(/,/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(v)) return null;
  const negative = v.startsWith("-");
  const [whole, frac = ""] = v.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 2_000_000_000) return null;
  return negative ? -cents : cents;
}

function classify(type: string): "reservation" | "payout" | "other" {
  const t = normalizeHeader(type);
  if (/payout|transfer|pago a /.test(t)) return "payout";
  if (/reserv/.test(t)) return "reservation";
  return "other";
}

export function parseAirbnbCsv(text: string): AirbnbParse {
  if (new TextEncoder().encode(text).length > MAX_AIRBNB_CSV_BYTES) return { ok: false, error: "El archivo supera 2 MB." };
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length < 2) return { ok: false, error: "El archivo no tiene filas." };
  if (table.length - 1 > MAX_AIRBNB_CSV_ROWS) return { ok: false, error: "El archivo supera 5.000 filas." };

  const headers = table[0].map(normalizeHeader);
  const col = {} as Record<Field, number>;
  for (const field of Object.keys(FIELD_ALIASES) as Field[]) {
    col[field] = headers.findIndex((h) => (FIELD_ALIASES[field] as readonly string[]).includes(h));
  }
  const missing = REQUIRED.filter((f) => col[f] < 0);
  if (missing.length > 0) {
    return { ok: false, error: `Faltan columnas: ${missing.map((f) => FIELD_ALIASES[f][0]).join(", ")}.` };
  }
  const cell = (row: string[], f: Field) => (col[f] >= 0 ? (row[col[f]] ?? "").trim() : "");

  const reservations: AirbnbReservation[] = [];
  const skipped: AirbnbSkipped[] = [];
  const payouts = { count: 0, totalCents: {} as Record<string, number> };
  const seen = new Set<string>();

  table.slice(1).forEach((row, index) => {
    const line = index + 2;
    const kind = classify(cell(row, "type"));
    if (kind === "payout") {
      const currency = cell(row, "currency").toUpperCase();
      const cents = parseAirbnbMoney(cell(row, "amount"));
      payouts.count += 1;
      if (cents !== null) payouts.totalCents[currency] = (payouts.totalCents[currency] ?? 0) + cents;
      return;
    }
    if (kind === "other") { skipped.push({ line, reason: `Tipo "${cell(row, "type")}" no se importa; revísalo a mano.` }); return; }

    const ref = cell(row, "code");
    const start = parseAirbnbDate(cell(row, "start"));
    const end = parseAirbnbDate(cell(row, "end"));
    const currency = cell(row, "currency").toUpperCase();
    const gross = parseAirbnbMoney(cell(row, "gross"));
    const service = parseAirbnbMoney(cell(row, "serviceFee"));
    const fast = parseAirbnbMoney(cell(row, "fastPayFee"));
    const occurredOn = cell(row, "date") ? parseAirbnbDate(cell(row, "date")) : end;
    if (!/^[A-Za-z0-9]{6,30}$/.test(ref)) return void skipped.push({ line, reason: "Código de confirmación inválido." });
    if (!start || !end || end <= start) return void skipped.push({ line, reason: "Fechas de estancia inválidas." });
    if (!occurredOn) return void skipped.push({ line, reason: "Fecha del movimiento inválida." });
    if (currency !== "PEN" && currency !== "USD") return void skipped.push({ line, reason: "Moneda no soportada (solo PEN o USD)." });
    if (gross === null || service === null || fast === null) return void skipped.push({ line, reason: "Monto inválido." });
    if (gross <= 0) return void skipped.push({ line, reason: "Monto cero o negativo (reembolso o ajuste); revísalo a mano." });
    if (seen.has(ref)) return void skipped.push({ line, reason: "Código repetido en el archivo; revísalo a mano." });
    seen.add(ref);
    reservations.push({
      line, ref, space: cell(row, "space"), guest: cell(row, "guest"), stayStart: start, stayEnd: end,
      occurredOn, currency, grossCents: gross, feeCents: Math.abs(service) + Math.abs(fast),
    });
  });

  const spaces = [...new Set(reservations.map((r) => r.space))].sort();
  return { ok: true, reservations, payouts, skipped, spaces };
}

/** Rows for the `import_airbnb_history` RPC. Reservations whose space has no unit are returned in `unmapped`. */
export function toImportRows(reservations: AirbnbReservation[], unitBySpace: Record<string, string>) {
  const rows: Record<string, unknown>[] = [];
  const unmapped: AirbnbReservation[] = [];
  for (const r of reservations) {
    const unitId = unitBySpace[r.space];
    if (!unitId) { unmapped.push(r); continue; }
    rows.push({
      ref: r.ref, unit_id: unitId, stay_start: r.stayStart, stay_end: r.stayEnd, occurred_on: r.occurredOn,
      guest: r.guest || null, currency: r.currency, gross_cents: r.grossCents, fee_cents: r.feeCents,
    });
  }
  return { rows, unmapped };
}
