import { z } from "zod";
import { positiveMoneySchema } from "./finance";

// Validation for the income/expense forms (SD-803) and the receipt upload. Pure:
// the server actions parse FormData strings with these schemas, then call the DAL.
// Messages are the user-facing Spanish copy. Amounts become integer cents with the
// exact decimal parser from SD-207; the exchange rate stays a decimal string that
// the database parses into numeric(12,6).

const MAX_TEXT = 200;
const MAX_NOTE = 1000;

export const PAYMENT_METHODS = ["cash", "bank_transfer", "yape_plin", "card", "platform", "other"] as const;
export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  cash: "Efectivo",
  bank_transfer: "Transferencia",
  yape_plin: "Yape / Plin",
  card: "Tarjeta",
  platform: "Plataforma",
  other: "Otro",
};
export const CHANNELS = ["direct", "airbnb", "booking", "other"] as const;
export const CHANNEL_LABELS: Record<(typeof CHANNELS)[number], string> = {
  direct: "Directo",
  airbnb: "Airbnb",
  booking: "Booking",
  other: "Otro",
};

export const uuid = z.string().uuid("Selecciona una opción válida");
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresa una fecha válida")
  .refine((value) => {
    const ms = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value && !value.startsWith("0000-");
  }, "Ingresa una fecha válida");

// Blank string -> undefined, so optional inputs can be left empty.
export const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema.optional());

export const currency = z.enum(["PEN", "USD"], { message: "Selecciona una moneda" });
export const fxRate = z
  .string()
  .trim()
  .regex(/^\d{1,2}(?:[.,]\d{1,6})?$/, "Usa un tipo de cambio como 3.75")
  .transform((value) => value.replace(",", "."))
  .refine((value) => Number(value) > 0 && Number(value) < 100, "El tipo de cambio debe estar entre 0 y 100");

export const paymentMethod = optional(z.enum(PAYMENT_METHODS, { message: "Selecciona un medio de pago" }));
const note = optional(z.string().trim().max(MAX_NOTE, `Máximo ${MAX_NOTE} caracteres`));
export const counterparty = optional(z.string().trim().max(MAX_TEXT, `Máximo ${MAX_TEXT} caracteres`));

// Foreign currency needs a rate; PEN must not carry one (matches the table's check).
export function currencyAndRate<T extends { currency: "PEN" | "USD"; fxRate?: string }>(value: T, ctx: z.RefinementCtx) {
  if (value.currency === "PEN" && value.fxRate !== undefined) {
    ctx.addIssue({ code: "custom", path: ["fxRate"], message: "El sol no lleva tipo de cambio" });
  }
  if (value.currency !== "PEN" && value.fxRate === undefined) {
    ctx.addIssue({ code: "custom", path: ["fxRate"], message: "Ingresa el tipo de cambio a soles" });
  }
}

// Generic income (non-rental) or expense.
export const entryFormSchema = z
  .object({
    kind: z.enum(["income", "expense"]),
    occurredOn: isoDate,
    amount: positiveMoneySchema,
    currency,
    fxRate: optional(fxRate),
    categoryId: uuid,
    unitId: optional(uuid),
    paymentMethod,
    counterparty,
    note,
  })
  .superRefine(currencyAndRate);
export type EntryForm = z.infer<typeof entryFormSchema>;

// Rental: a stay with optional commission and cleaning, registered together.
export const rentalFormSchema = z
  .object({
    unitId: uuid,
    stayStart: isoDate,
    stayEnd: isoDate,
    channel: z.enum(CHANNELS, { message: "Selecciona el canal" }),
    guests: optional(z.coerce.number({ error: "Usa un número entero" }).int("Usa un número entero").min(1, "Mínimo 1").max(1000, "Máximo 1000")),
    guestName: counterparty,
    occurredOn: isoDate,
    amount: positiveMoneySchema,
    currency,
    fxRate: optional(fxRate),
    paymentMethod,
    note,
    commission: optional(positiveMoneySchema),
    cleaning: optional(positiveMoneySchema),
  })
  .superRefine(currencyAndRate)
  .superRefine((value, ctx) => {
    if (value.stayEnd <= value.stayStart) {
      ctx.addIssue({ code: "custom", path: ["stayEnd"], message: "La salida debe ser posterior a la llegada" });
    }
  });
export type RentalForm = z.infer<typeof rentalFormSchema>;

// ─── Receipts ───────────────────────────────────────────────────────────────

// 4 MB: below the bucket's 5 MB and Vercel's 4.5 MB request-body cap.
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

export type ReceiptKind = {
  mime: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  ext: "jpg" | "png" | "webp" | "pdf";
};

// The declared Content-Type is client-controlled (and is all the bucket's
// allowed_mime_types can check), so the real type comes from the magic bytes.
// SVG, HTML and anything else is refused even with an image extension.
export function detectReceiptKind(bytes: Uint8Array): ReceiptKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") {
    return { mime: "application/pdf", ext: "pdf" };
  }
  return null;
}

export type ReceiptCheck = { ok: true; kind: ReceiptKind } | { ok: false; error: string };

export function checkReceipt(bytes: Uint8Array): ReceiptCheck {
  if (bytes.length === 0) return { ok: false, error: "El archivo está vacío." };
  if (bytes.length > MAX_RECEIPT_BYTES) return { ok: false, error: "El comprobante supera los 4 MB." };
  const kind = detectReceiptKind(bytes);
  if (!kind) return { ok: false, error: "Formato no admitido. Usa JPEG, PNG, WebP o PDF." };
  return { ok: true, kind };
}

// {org_id}/receipts/{uuid}.ext — the first segment is what the storage policies
// and the table's receipt_path check authorise on. `fileId` must be a fresh uuid
// generated by the server, never user input.
export function buildReceiptPath(orgId: string, fileId: string, ext: ReceiptKind["ext"]): string {
  if (!z.string().uuid().safeParse(orgId).success || !z.string().uuid().safeParse(fileId).success) {
    throw new Error("buildReceiptPath: orgId and fileId must be uuids");
  }
  return `${orgId}/receipts/${fileId}.${ext}`;
}
