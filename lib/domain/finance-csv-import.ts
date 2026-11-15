import { createHash } from "node:crypto";
import { MAX_AIRBNB_CSV_BYTES, MAX_AIRBNB_CSV_ROWS, parseAirbnbMoney, parseCsv } from "./airbnb-import";

// SD-420: pure parser for the owner's income/expense CSV template (no I/O). Every row becomes one ledger entry
// through public.import_finance_rows. Re-importing the same file adds nothing: each row's `ref` is a hash of its
// content plus its occurrence number (two identical rows in one file are two real movements, the same file twice is not).
export const MAX_FINANCE_CSV_BYTES = MAX_AIRBNB_CSV_BYTES;
export const MAX_FINANCE_CSV_ROWS = MAX_AIRBNB_CSV_ROWS;

export const FINANCE_CSV_TEMPLATE =
  "fecha,tipo,categoria,monto,moneda,descripcion,proveedor,metodo,casa\n" +
  "2026-03-05,gasto,Limpieza,80.00,PEN,Limpieza semanal,Rosa,efectivo,\n" +
  "2026-03-07,ingreso,Servicios extra,40.00,PEN,Lavandería huésped,,yape,\n";

const ALIASES = {
  date: ["fecha", "date"],
  kind: ["tipo", "type"],
  category: ["categoria", "category"],
  amount: ["monto", "importe", "amount"],
  currency: ["moneda", "currency"],
  note: ["descripcion", "nota", "detalle", "note", "description"],
  counterparty: ["proveedor", "cliente", "contraparte", "counterparty"],
  method: ["metodo", "metodo de pago", "payment method", "method"],
  unit: ["casa", "unidad", "unit"],
} as const;
type Field = keyof typeof ALIASES;
const REQUIRED: Field[] = ["date", "kind", "amount"];

const METHODS: Record<string, string> = {
  efectivo: "cash", cash: "cash",
  transferencia: "bank_transfer", banco: "bank_transfer", "bank transfer": "bank_transfer",
  yape: "yape_plin", plin: "yape_plin", "yape/plin": "yape_plin", yape_plin: "yape_plin",
  tarjeta: "card", card: "card",
  plataforma: "platform", platform: "platform",
  otro: "other", other: "other",
};

export type FinanceCsvRow = {
  ref: string;
  kind: "income" | "expense";
  category: string | null;
  occurred_on: string;
  amount_cents: number;
  currency: "PEN" | "USD";
  unit_id: string | null;
  payment_method: string | null;
  counterparty: string | null;
  note: string | null;
};
export type FinanceCsvSkipped = { line: number; reason: string };
export type FinanceCsvParse =
  | { ok: false; error: string }
  | { ok: true; rows: FinanceCsvRow[]; skipped: FinanceCsvSkipped[]; totals: { PEN: { income: number; expense: number }; USD: { income: number; expense: number } }; needsFxRate: boolean };

function norm(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** YYYY-MM-DD or D/M/YYYY (Peru order) → ISO date, or null when not a real calendar date. */
export function parseFinanceDate(value: string): string | null {
  const v = value.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const pe = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (iso) { y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]); }
  else if (pe) { d = Number(pe[1]); m = Number(pe[2]); y = Number(pe[3]); }
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseKind(value: string): "income" | "expense" | null {
  const t = norm(value);
  if (["ingreso", "income", "entrada"].includes(t)) return "income";
  if (["gasto", "egreso", "expense", "salida"].includes(t)) return "expense";
  return null;
}

export function parseFinanceCsv(text: string, todayLima: string, unitIdByName: Record<string, string>): FinanceCsvParse {
  if (new TextEncoder().encode(text).length > MAX_FINANCE_CSV_BYTES) return { ok: false, error: "El archivo supera 2 MB." };
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length < 2) return { ok: false, error: "El archivo no tiene filas." };
  if (table.length - 1 > MAX_FINANCE_CSV_ROWS) return { ok: false, error: "El archivo supera 5.000 filas." };

  const headers = table[0].map(norm);
  const col = {} as Record<Field, number>;
  for (const field of Object.keys(ALIASES) as Field[]) {
    col[field] = headers.findIndex((h) => (ALIASES[field] as readonly string[]).includes(h));
  }
  const missing = REQUIRED.filter((f) => col[f] < 0);
  if (missing.length > 0) return { ok: false, error: `Faltan columnas: ${missing.map((f) => ALIASES[f][0]).join(", ")}.` };

  const units = new Map(Object.entries(unitIdByName).map(([name, id]) => [norm(name), id]));
  const cell = (r: string[], f: Field) => (col[f] >= 0 ? (r[col[f]] ?? "").trim() : "");
  const rows: FinanceCsvRow[] = [];
  const skipped: FinanceCsvSkipped[] = [];
  const seen = new Map<string, number>();
  const totals = { PEN: { income: 0, expense: 0 }, USD: { income: 0, expense: 0 } };

  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const fail = (reason: string) => skipped.push({ line, reason });
    const date = parseFinanceDate(cell(r, "date"));
    if (!date) return fail("Fecha no válida (usa AAAA-MM-DD o DD/MM/AAAA).");
    if (date > todayLima) return fail("La fecha es futura.");
    if (date < "2000-01-01") return fail("La fecha es anterior al año 2000.");
    const kind = parseKind(cell(r, "kind"));
    if (!kind) return fail("Tipo no válido (usa «ingreso» o «gasto»).");
    const amount = parseAirbnbMoney(cell(r, "amount"));
    if (amount === null || amount <= 0) return fail("Monto no válido (debe ser mayor que 0).");
    const rawCurrency = cell(r, "currency").toUpperCase();
    const currency = rawCurrency === "" || rawCurrency === "S/" ? "PEN" : rawCurrency;
    if (currency !== "PEN" && currency !== "USD") return fail("Moneda no válida (PEN o USD).");
    const rawMethod = cell(r, "method");
    const method = rawMethod === "" ? null : (METHODS[norm(rawMethod)] ?? undefined);
    if (method === undefined) return fail("Método de pago no válido.");
    const rawUnit = cell(r, "unit");
    const unitId = rawUnit === "" ? null : (units.get(norm(rawUnit)) ?? undefined);
    if (unitId === undefined) return fail(`No existe la casa «${rawUnit}».`);
    const counterparty = cell(r, "counterparty").slice(0, 200) || null;
    const note = cell(r, "note").slice(0, 1000) || null;
    const category = cell(r, "category") || null;

    const content = [date, kind, norm(category ?? ""), amount, currency, unitId ?? "", method ?? "", norm(counterparty ?? ""), norm(note ?? "")].join("|");
    const n = (seen.get(content) ?? 0) + 1;
    seen.set(content, n);
    const ref = createHash("sha256").update(`${content}#${n}`).digest("hex").slice(0, 32);
    rows.push({ ref, kind, category, occurred_on: date, amount_cents: amount, currency, unit_id: unitId, payment_method: method, counterparty, note });
    totals[currency][kind] += amount;
  });

  return { ok: true, rows, skipped, totals, needsFxRate: rows.some((r) => r.currency === "USD") };
}
