import "server-only";
import { log } from "@/lib/log";
import { requireActiveOrg } from "./organizations";
import { createClient } from "@/lib/supabase/server";
import {
  BOOKING_PAGE_SIZE, bookingActionError, type BookingAction, type BookingQuery, type BookingStatus, type PaymentStatus,
} from "@/lib/domain/bookings";
import {
  manualActionError, manualBookingResultSchema, manualPaymentResultSchema, PRICING_ERROR_MESSAGE, snapshotDiffers,
  type ManualBookingInput, type ManualPaymentInput,
} from "@/lib/domain/manual-booking";

// Bookings management (SD-406). Everything goes through the owner's own session: reads are limited by RLS (members of the active
// organization) and the three actions are SECURITY DEFINER RPCs that re-check membership and state. The service role is not used.
export const BOOKINGS_ERROR = "No se pudieron cargar las reservas. Intenta de nuevo.";

export async function getBookingsContext() {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) return null;
  // Approving/rejecting a payment and cancelling are owner-only (SD-413); the RPCs enforce it, this flag only shapes the UI and fails fast.
  return { supabase: await createClient(), orgId: activeOrg.id, isOwner: activeOrg.role === "owner" };
}
type Context = NonNullable<Awaited<ReturnType<typeof getBookingsContext>>>;

export type BookingRow = {
  id: string;
  status: BookingStatus;
  checkIn: string;
  checkOut: string;
  guests: number;
  currency: "PEN" | "USD";
  totalCents: number;
  depositCents: number;
  expiresAt: string | null;
  createdAt: string;
  unitName: string;
  guestName: string;
  hasVoucherToReview: boolean;
};

const BOOKING_COLUMNS = "id, status, check_in, check_out, guests, currency, total_cents, deposit_cents, expires_at, created_at, unit_id, guest_id";
// PostgREST answers 416 when the requested page starts past the last row (a stale bookmark, or a filter that just emptied the list).
const OUT_OF_RANGE = "PGRST103";
const fail = (where: string, code: string | undefined): never => {
  log("error", "bookings.read_failed", { code: code ?? "UNKNOWN", outcome: where });
  throw new Error(BOOKINGS_ERROR);
};

export async function listBookings(ctx: Context, query: BookingQuery): Promise<{ rows: BookingRow[]; total: number }> {
  const { supabase, orgId } = ctx;
  // "needs_review": pending bookings with a voucher under review, in ONE query (inner join on payments): no id list travels in the URL and
  // there is no cap that could silently hide some. At most one voucher is under review per booking (unique index), so no duplicates.
  const needsReview = query.filter === "needs_review";
  let q = needsReview
    ? supabase.from("bookings").select(`${BOOKING_COLUMNS}, payments!inner(id)`, { count: "exact" }).eq("org_id", orgId).eq("payments.status", "pending_review").eq("status", "pending_payment")
    : supabase.from("bookings").select(BOOKING_COLUMNS, { count: "exact" }).eq("org_id", orgId);
  const status = query.filter === "all" || query.filter === "needs_review" ? null : query.filter;
  if (status) q = q.eq("status", status);
  if (query.from) q = q.gte("check_in", query.from);
  if (query.to) q = q.lte("check_in", query.to);
  const start = (query.page - 1) * BOOKING_PAGE_SIZE;
  const { data, count, error } = await q.order("created_at", { ascending: false }).order("id").range(start, start + BOOKING_PAGE_SIZE - 1);
  if (error?.code === OUT_OF_RANGE) {
    // Past the last page: report the real total so the page can send the user to the last one instead of showing an error.
    return { rows: [], total: await countBookings(ctx, query) };
  }
  if (error) fail("list", error.code);
  const bookings = data ?? [];
  if (bookings.length === 0) return { rows: [], total: count ?? 0 };

  const guestIds = [...new Set(bookings.map((b) => b.guest_id))];
  const unitIds = [...new Set(bookings.map((b) => b.unit_id))];
  const ids = bookings.map((b) => b.id);
  const [guests, units, reviews] = await Promise.all([
    supabase.from("guests").select("id, name").eq("org_id", orgId).in("id", guestIds),
    supabase.from("units").select("id, name").eq("org_id", orgId).in("id", unitIds),
    supabase.from("payments").select("booking_id").eq("org_id", orgId).eq("status", "pending_review").in("booking_id", ids),
  ]);
  if (guests.error) fail("guests", guests.error.code);
  if (units.error) fail("units", units.error.code);
  if (reviews.error) fail("reviews", reviews.error.code);
  const guestName = new Map((guests.data ?? []).map((g) => [g.id, g.name]));
  const unitName = new Map((units.data ?? []).map((u) => [u.id, u.name]));
  const toReview = new Set((reviews.data ?? []).map((p) => p.booking_id));

  return {
    total: count ?? bookings.length,
    rows: bookings.map((b) => ({
      id: b.id, status: b.status, checkIn: b.check_in, checkOut: b.check_out, guests: b.guests, currency: b.currency,
      totalCents: b.total_cents, depositCents: b.deposit_cents, expiresAt: b.expires_at, createdAt: b.created_at,
      unitName: unitName.get(b.unit_id) ?? "—", guestName: guestName.get(b.guest_id) ?? "—", hasVoucherToReview: toReview.has(b.id),
    })),
  };
}

async function countBookings(ctx: Context, query: BookingQuery): Promise<number> {
  const { supabase, orgId } = ctx;
  const needsReview = query.filter === "needs_review";
  let q = needsReview
    ? supabase.from("bookings").select("id, payments!inner(id)", { count: "exact", head: true }).eq("org_id", orgId).eq("payments.status", "pending_review").eq("status", "pending_payment")
    : supabase.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  const status = query.filter === "all" || query.filter === "needs_review" ? null : query.filter;
  if (status) q = q.eq("status", status);
  if (query.from) q = q.gte("check_in", query.from);
  if (query.to) q = q.lte("check_in", query.to);
  const { count, error } = await q;
  if (error) fail("count", error.code);
  return count ?? 0;
}

export type PaymentRow = {
  id: string;
  status: PaymentStatus;
  method: string;
  amountCents: number;
  currency: "PEN" | "USD";
  reference: string | null;
  hasVoucher: boolean;
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
};
export type BookingDetail = Omit<BookingRow, "hasVoucherToReview" | "guestName"> & {
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  guest: { name: string; email: string; phone: string | null };
  /** What the guest typed in the checkout (null fields: booking made before the snapshot existed), and whether it differs from the guest record. */
  guestSnapshot: { name: string | null; phone: string | null; differs: boolean };
  payments: PaymentRow[];
  hasVoucherToReview: boolean;
};

export async function getBookingDetail(ctx: Context, bookingId: string): Promise<BookingDetail | null> {
  const { supabase, orgId } = ctx;
  const booking = await supabase.from("bookings")
    .select(`${BOOKING_COLUMNS}, confirmed_at, cancelled_at, cancel_reason, guest_name, guest_phone`).eq("org_id", orgId).eq("id", bookingId).maybeSingle();
  if (booking.error) fail("detail", booking.error.code);
  const b = booking.data;
  if (!b) return null;
  const [guest, unit, payments] = await Promise.all([
    supabase.from("guests").select("name, email, phone").eq("org_id", orgId).eq("id", b.guest_id).maybeSingle(),
    supabase.from("units").select("name").eq("org_id", orgId).eq("id", b.unit_id).maybeSingle(),
    supabase.from("payments").select("id, status, method, amount_cents, currency, reference, voucher_path, reject_reason, created_at, reviewed_at")
      .eq("org_id", orgId).eq("booking_id", b.id).order("created_at", { ascending: false }),
  ]);
  for (const [name, r] of [["guest", guest], ["unit", unit], ["payments", payments]] as const) {
    if (r.error) fail(name, r.error.code);
  }
  const rows: PaymentRow[] = (payments.data ?? []).map((p) => ({
    id: p.id, status: p.status, method: p.method, amountCents: p.amount_cents, currency: p.currency, reference: p.reference,
    hasVoucher: p.voucher_path !== null, rejectReason: p.reject_reason, createdAt: p.created_at, reviewedAt: p.reviewed_at,
  }));
  return {
    id: b.id, status: b.status, checkIn: b.check_in, checkOut: b.check_out, guests: b.guests, currency: b.currency,
    totalCents: b.total_cents, depositCents: b.deposit_cents, expiresAt: b.expires_at, createdAt: b.created_at,
    unitName: unit.data?.name ?? "—", confirmedAt: b.confirmed_at, cancelledAt: b.cancelled_at, cancelReason: b.cancel_reason,
    guest: { name: guest.data?.name ?? "—", email: guest.data?.email ?? "", phone: guest.data?.phone ?? null },
    guestSnapshot: {
      name: b.guest_name, phone: b.guest_phone,
      differs: guest.data ? snapshotDiffers({ name: b.guest_name, phone: b.guest_phone }, guest.data) : false,
    },
    payments: rows, hasVoucherToReview: rows.some((p) => p.status === "pending_review"),
  };
}

// ─── Actions (RPCs; membership and state are enforced in the database) ─────────
export type ActionResult = { ok: true } | { ok: false; error: string };

function result(action: BookingAction, error: { code?: string } | null): ActionResult {
  if (!error) return { ok: true };
  log("warn", "bookings.action_failed", { code: error.code ?? "UNKNOWN", outcome: action });
  return { ok: false, error: bookingActionError(action, error.code) };
}

export async function approvePayment(ctx: Context, paymentId: string, fxRate: number | null): Promise<ActionResult> {
  const { error } = await ctx.supabase.rpc("confirm_payment", { p_org_id: ctx.orgId, p_payment_id: paymentId, p_fx_rate_pen: fxRate ?? undefined });
  return result("approve", error);
}

export async function rejectPayment(ctx: Context, paymentId: string, reason: string): Promise<ActionResult> {
  const { error } = await ctx.supabase.rpc("reject_payment", { p_org_id: ctx.orgId, p_payment_id: paymentId, p_reason: reason || undefined });
  return result("reject", error);
}

export async function cancelBooking(ctx: Context, bookingId: string, reason: string): Promise<ActionResult> {
  const { error } = await ctx.supabase.rpc("cancel_booking", { p_org_id: ctx.orgId, p_booking_id: bookingId, p_reason: reason || undefined });
  return result("cancel", error);
}

// ─── Owner-registered bookings and payments (SD-413). The RPCs are owner-only and price/validate in the database. ───────────────
export type ManualResult<T> = ({ ok: true } & T) | { ok: false; error: string };

export async function listBookableUnits(ctx: Context): Promise<{ id: string; name: string; maxGuests: number }[]> {
  const { data, error } = await ctx.supabase.from("units").select("id, name, max_guests").eq("org_id", ctx.orgId).eq("active", true).order("name");
  if (error) fail("units", error.code);
  return (data ?? []).map((u) => ({ id: u.id, name: u.name, maxGuests: u.max_guests }));
}

export async function createManualBooking(ctx: Context, input: ManualBookingInput): Promise<ManualResult<{ bookingId: string }>> {
  const { data, error } = await ctx.supabase.rpc("create_manual_booking", {
    p_org_id: ctx.orgId, p_unit_id: input.unitId, p_check_in: input.checkIn, p_check_out: input.checkOut, p_guests: input.guests,
    p_guest_name: input.name, p_guest_email: input.email, p_guest_phone: input.phone || undefined, p_lang: input.lang,
  });
  if (error) {
    log("warn", "bookings.manual_failed", { code: error.code ?? "UNKNOWN", outcome: "create" });
    return { ok: false, error: manualActionError("booking", error.code) };
  }
  const parsed = manualBookingResultSchema.safeParse(data);
  if (!parsed.success) {
    log("error", "bookings.manual_failed", { code: "INVALID_RESPONSE", outcome: "create" });
    return { ok: false, error: manualActionError("booking", undefined) };
  }
  if (!parsed.data.ok) return { ok: false, error: PRICING_ERROR_MESSAGE[parsed.data.error] ?? manualActionError("booking", undefined) };
  return { ok: true, bookingId: parsed.data.booking_id };
}

export async function recordManualPayment(ctx: Context, input: ManualPaymentInput): Promise<ManualResult<{ replayed: boolean }>> {
  const { data, error } = await ctx.supabase.rpc("record_manual_payment", {
    p_org_id: ctx.orgId, p_booking_id: input.bookingId, p_amount_cents: input.amount, p_method: input.method,
    p_reference: input.reference || undefined, p_fx_rate_pen: input.fxRate ?? undefined, p_payment_id: input.paymentId,
  });
  if (error) {
    log("warn", "bookings.manual_failed", { code: error.code ?? "UNKNOWN", outcome: "payment" });
    return { ok: false, error: manualActionError("payment", error.code) };
  }
  const parsed = manualPaymentResultSchema.safeParse(data);
  if (!parsed.success) {
    log("error", "bookings.manual_failed", { code: "INVALID_RESPONSE", outcome: "payment" });
    return { ok: false, error: manualActionError("payment", undefined) };
  }
  return { ok: true, replayed: parsed.data.replayed ?? false };
}
