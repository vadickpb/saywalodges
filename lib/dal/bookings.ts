import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { log } from "@/lib/log";
import { requireActiveOrg } from "./organizations";
import { createClient } from "@/lib/supabase/server";
import {
  BOOKING_PAGE_SIZE, bookingActionError, type BookingAction, type BookingQuery, type BookingStatus, type PaymentStatus,
} from "@/lib/domain/bookings";

// Bookings management (SD-406). Everything goes through the owner's own session: reads are limited by RLS (members of the active
// organization) and the three actions are SECURITY DEFINER RPCs that re-check membership and state. The service role is not used.
type Client = SupabaseClient<Database>;
export const BOOKINGS_ERROR = "No se pudieron cargar las reservas. Intenta de nuevo.";

export async function getBookingsContext() {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) return null;
  return { supabase: await createClient(), orgId: activeOrg.id };
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
const fail = (where: string, code: string | undefined): never => {
  log("error", "bookings.read_failed", { code: code ?? "UNKNOWN", outcome: where });
  throw new Error(BOOKINGS_ERROR);
};

async function pendingReviewBookingIds(supabase: Client, orgId: string): Promise<string[]> {
  const { data, error } = await supabase.from("payments").select("booking_id").eq("org_id", orgId).eq("status", "pending_review").limit(1000);
  if (error) fail("pending_review", error.code);
  return (data ?? []).map((p) => p.booking_id);
}

export async function listBookings(ctx: Context, query: BookingQuery): Promise<{ rows: BookingRow[]; total: number }> {
  const { supabase, orgId } = ctx;
  let q = supabase.from("bookings").select(BOOKING_COLUMNS, { count: "exact" }).eq("org_id", orgId);
  if (query.filter === "needs_review") {
    const ids = await pendingReviewBookingIds(supabase, orgId);
    if (ids.length === 0) return { rows: [], total: 0 };
    q = q.eq("status", "pending_payment").in("id", ids);
  } else if (query.filter !== "all") {
    q = q.eq("status", query.filter);
  }
  if (query.from) q = q.gte("check_in", query.from);
  if (query.to) q = q.lte("check_in", query.to);
  const start = (query.page - 1) * BOOKING_PAGE_SIZE;
  const { data, count, error } = await q.order("created_at", { ascending: false }).order("id").range(start, start + BOOKING_PAGE_SIZE - 1);
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
  payments: PaymentRow[];
  hasVoucherToReview: boolean;
};

export async function getBookingDetail(ctx: Context, bookingId: string): Promise<BookingDetail | null> {
  const { supabase, orgId } = ctx;
  const booking = await supabase.from("bookings")
    .select(`${BOOKING_COLUMNS}, confirmed_at, cancelled_at, cancel_reason`).eq("org_id", orgId).eq("id", bookingId).maybeSingle();
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
