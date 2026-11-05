import { z } from "zod";

// Owner-registered bookings and payments (SD-413). Pure: input validation, money parsing and error mapping. The database is the
// authority: it prices the stay, checks availability, enforces owner-only and caps payments at the total. Nothing here sends a price.

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v));

// Same shape the guest checkout accepts (lib/domain/quote-checkout.ts): printable, no invisible/bidi characters.
const NO_INVISIBLE = new RegExp("^[^" + ["\\u0000-\\u001f", "\\u007f-\\u009f", "\\u00ad", "\\u200b-\\u200f", "\\u2028-\\u202e", "\\u2060-\\u2064", "\\u2066-\\u206f", "\\ufeff"].join("") + "]*$");

export const manualBookingSchema = z.object({
  unitId: z.uuid(),
  checkIn: isoDate,
  checkOut: isoDate,
  guests: z.coerce.number().int().min(1).max(50),
  name: z.string().trim().min(1).max(200).regex(NO_INVISIBLE),
  email: z.string().trim().toLowerCase().max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
  phone: z.string().trim().max(30).regex(/^([0-9+() -]{5,30})?$/),
  lang: z.enum(["es", "en"]),
}).refine((v) => v.checkOut > v.checkIn, { path: ["checkOut"] });
export type ManualBookingInput = z.infer<typeof manualBookingSchema>;

/** "150", "150.5", "150,50" -> cents. Only plain positive amounts with up to two decimals; anything else is null. */
export function parseMoneyToCents(value: string): number | null {
  const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
  return cents >= 1 ? cents : null;
}

export const MANUAL_METHODS = ["cash", "yape", "plin", "bank_transfer"] as const;

export const manualPaymentSchema = z.object({
  bookingId: z.uuid(),
  // One id per form: a double click or a retry replays instead of charging twice.
  paymentId: z.uuid(),
  amount: z.string().transform((v, ctx) => {
    const cents = parseMoneyToCents(v);
    if (cents === null) ctx.addIssue({ code: "custom", message: "amount" });
    return cents ?? 0;
  }),
  method: z.enum(MANUAL_METHODS),
  reference: z.string().trim().max(200).regex(NO_INVISIBLE),
  fxRate: z.string().trim().transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v.replace(",", "."));
    if (!/^\d{1,2}(?:[.,]\d{1,4})?$/.test(v) || !(n > 0 && n < 100)) ctx.addIssue({ code: "custom", message: "fx" });
    return n;
  }),
});
export type ManualPaymentInput = z.infer<typeof manualPaymentSchema>;

export type ManualAction = "booking" | "payment";

/** Screen messages (Spanish) for the RPC outcomes. Never the database text. */
export function manualActionError(action: ManualAction, code: string | undefined): string {
  switch (code) {
    case "42501":
      return "Solo el dueño puede hacerlo, o la unidad/reserva no existe.";
    case "23P01":
      return "Esas fechas ya están ocupadas en esa unidad.";
    case "55000":
      return action === "payment"
        ? "La reserva cambió de estado o hay un comprobante en revisión: revísalo primero en la reserva."
        : "No se pudo completar: el estado cambió. Actualiza la página.";
    case "22023":
      return action === "payment"
        ? "Revisa el monto: no puede superar lo que falta por cobrar, el adelanto debe cubrir el mínimo y en dólares hace falta el tipo de cambio."
        : "Revisa los datos: fechas desde hoy, hasta 90 noches, correo válido.";
    default:
      return "No se pudo completar la acción. Inténtalo de nuevo en unos minutos.";
  }
}

export const PRICING_ERROR_MESSAGE: Record<string, string> = {
  UNIT_NOT_FOUND: "La unidad no existe.",
  UNIT_INACTIVE: "La unidad está desactivada.",
  INVALID_DATES: "Las fechas no son válidas.",
  CAPACITY_EXCEEDED: "Se supera la capacidad de la unidad.",
  MIN_NIGHTS: "No se alcanza el mínimo de noches de esa tarifa.",
  MISSING_RATE: "Faltan tarifas para alguna noche: configúralas en Tarifas.",
  AMBIGUOUS_SEASON: "Hay dos temporadas con la misma prioridad en esas fechas.",
  INVALID_CONFIGURATION: "La configuración de la unidad no es válida.",
  AMOUNT_OVERFLOW: "El importe es demasiado grande.",
};

export const manualBookingResultSchema = z.union([
  z.object({ ok: z.literal(true), booking_id: z.uuid() }),
  z.object({ ok: z.literal(false), error: z.string().max(40) }),
]);
export const manualPaymentResultSchema = z.object({ ok: z.literal(true), payment_id: z.uuid(), replayed: z.boolean().optional() });

/** The snapshot is what the guest typed; warn when it differs from the guest record the owner sees elsewhere. */
export function snapshotDiffers(
  snapshot: { name: string | null; phone: string | null },
  guest: { name: string; phone: string | null },
): boolean {
  const norm = (v: string | null) => (v ?? "").replace(/[\s()-]/g, "").toLowerCase();
  if (snapshot.name === null && snapshot.phone === null) return false; // booking made before the snapshot existed
  return norm(snapshot.name) !== norm(guest.name) || norm(snapshot.phone) !== norm(guest.phone);
}
