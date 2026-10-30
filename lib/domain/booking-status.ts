import { z } from "zod";

// Public booking status (SD-408). Pure: maps the snapshot returned by
// get_booking_status to the single state the guest page shows. No PII lives here.

export const bookingStatusSchema = z.object({
  status: z.enum(["pending_payment", "confirmed", "cancelled", "expired"]),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.number().int().positive(),
  currency: z.enum(["PEN", "USD"]),
  total_cents: z.number().int().nonnegative(),
  deposit_cents: z.number().int().nonnegative(),
  expires_at: z.string().nullable(),
  property_name: z.string(),
  unit_name: z.string(),
  voucher: z.enum(["none", "under_review", "rejected"]),
  hold_lapsed: z.boolean(),
});
export type BookingStatusSnapshot = z.infer<typeof bookingStatusSchema>;

export type BookingState =
  | "awaiting_payment"
  | "voucher_rejected"
  | "under_review"
  | "confirmed"
  | "expired"
  | "cancelled";

// A voucher under review keeps the hold alive (release_expired_holds skips it), so it wins
// over a lapsed clock. A lapsed hold with no voucher is shown as expired before the sweep runs.
export function resolveBookingState(s: Pick<BookingStatusSnapshot, "status" | "voucher" | "hold_lapsed">): BookingState {
  if (s.status === "confirmed") return "confirmed";
  if (s.status === "cancelled") return "cancelled";
  if (s.status === "expired") return "expired";
  if (s.voucher === "under_review") return "under_review";
  if (s.hold_lapsed) return "expired";
  if (s.voucher === "rejected") return "voucher_rejected";
  return "awaiting_payment";
}

// Capability tokens are 64 lowercase hex chars; anything else is rejected before touching the DB.
export const PUBLIC_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
