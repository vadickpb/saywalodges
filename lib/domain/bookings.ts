import { z } from "zod";

// Bookings management for the owner (SD-406). Pure: filters, labels, which actions make sense, input validation and error
// mapping. The database is the authority (RPCs check membership and state); this only gives the owner clear screens and messages.

export const BOOKING_PAGE_SIZE = 20;

export const BOOKING_FILTERS = ["all", "needs_review", "pending_payment", "confirmed", "cancelled", "expired"] as const;
export type BookingFilter = (typeof BOOKING_FILTERS)[number];
export const FILTER_LABEL: Record<BookingFilter, string> = {
  all: "Todas",
  needs_review: "Comprobante por revisar",
  pending_payment: "Esperando pago",
  confirmed: "Confirmadas",
  cancelled: "Canceladas",
  expired: "Vencidas",
};

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v));

export type BookingQuery = { filter: BookingFilter; from: string | null; to: string | null; page: number };
type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Reads the URL query defensively: anything malformed falls back to the default instead of failing the page. */
export function parseBookingQuery(params: Params): BookingQuery {
  const filter = z.enum(BOOKING_FILTERS).catch("all").parse(first(params.estado));
  const from = isoDate.safeParse(first(params.desde));
  const to = isoDate.safeParse(first(params.hasta));
  const page = z.coerce.number().int().min(1).max(10_000).catch(1).parse(first(params.pagina));
  return {
    filter,
    from: from.success ? from.data : null,
    to: to.success ? to.data : null,
    page,
  };
}

export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "expired";
export type PaymentStatus = "pending_review" | "approved" | "rejected";

/** What the list shows for a booking: a pending booking with a voucher to look at is the owner's to-do. */
export function bookingStateLabel(status: BookingStatus, hasVoucherToReview: boolean): { label: string; tone: "action" | "ok" | "muted" | "warn" } {
  if (status === "confirmed") return { label: "Confirmada", tone: "ok" };
  if (status === "cancelled") return { label: "Cancelada", tone: "muted" };
  if (status === "expired") return { label: "Vencida", tone: "muted" };
  return hasVoucherToReview ? { label: "Comprobante por revisar", tone: "action" } : { label: "Esperando pago", tone: "warn" };
}

export const canCancel = (status: BookingStatus) => status === "pending_payment" || status === "confirmed";
export const canReview = (booking: BookingStatus, payment: PaymentStatus) => booking === "pending_payment" && payment === "pending_review";

export const METHOD_LABEL: Record<string, string> = {
  yape: "Yape", plin: "Plin", bank_transfer: "Transferencia", mercado_pago: "Mercado Pago", cash: "Efectivo",
};
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending_review: "En revisión", approved: "Aprobado", rejected: "Rechazado",
};

// ─── Action inputs ──────────────────────────────────────────────────────────
const uuid = z.string().uuid();
const reasonText = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(v), "caracteres no permitidos");

/** Exchange rate S/ per unit of foreign currency: positive, below 100 (the database refuses anything else), at most 4 decimals. */
export const fxRateSchema = z
  .string()
  .trim()
  .regex(/^\d{1,4}(\.\d{1,4})?$/)
  .transform(Number)
  .refine((n) => n > 0 && n < 100);

export const approvePaymentSchema = z.object({ bookingId: uuid, paymentId: uuid, fxRate: z.union([z.literal(""), fxRateSchema]).transform((v) => (v === "" ? null : v)) });
export const rejectPaymentSchema = z.object({ bookingId: uuid, paymentId: uuid, reason: reasonText });
export const cancelBookingSchema = z.object({ bookingId: uuid, reason: reasonText });

export type BookingAction = "approve" | "reject" | "cancel";

/** Maps a database error code to what the owner can act on. Never exposes the database message. */
export function bookingActionError(action: BookingAction, code: string | undefined): string {
  switch (code) {
    case "42501":
      return "No se encontró la reserva o solo el dueño puede hacer esta acción.";
    case "55000":
      return "La reserva ya cambió de estado. Actualiza la página para ver su situación actual.";
    case "22023":
      return action === "approve"
        ? "No se pudo aprobar: falta el tipo de cambio de esta moneda o no es válido (soles por unidad, mayor que 0 y menor que 100). Escríbelo e inténtalo de nuevo."
        : "Revisa el motivo e inténtalo de nuevo.";
    default:
      return "No se pudo completar la acción. Inténtalo de nuevo en unos minutos.";
  }
}
