"use server";

import { revalidatePath } from "next/cache";
import { approvePayment, cancelBooking, getBookingsContext, rejectPayment, type ActionResult } from "@/lib/dal/bookings";
import { approvePaymentSchema, cancelBookingSchema, rejectPaymentSchema } from "@/lib/domain/bookings";
import { readText } from "../site/_lib/form-state";

// Owner actions on a booking (SD-406). Input is validated with zod; the amount of a payment is never accepted from here (the database
// approves what the guest registered). Membership and state are enforced again by the RPCs, so a forged id of another tenant fails there.
const INVALID: ActionResult = { ok: false, error: "Revisa los datos e inténtalo de nuevo." };
const NO_ORG: ActionResult = { ok: false, error: "No hay una organización activa." };
const NOT_OWNER: ActionResult = { ok: false, error: "Solo el dueño puede aprobar, rechazar o cancelar reservas." };

async function run(fn: (ctx: NonNullable<Awaited<ReturnType<typeof getBookingsContext>>>) => Promise<ActionResult>, bookingId: string): Promise<ActionResult> {
  let outcome: ActionResult;
  try {
    const ctx = await getBookingsContext();
    if (!ctx) return NO_ORG;
    if (!ctx.isOwner) return NOT_OWNER;
    outcome = await fn(ctx);
  } catch {
    // The DAL already logged a closed machine code. Never forward the thrown message.
    return { ok: false, error: "No se pudo completar la acción. Inténtalo de nuevo en unos minutos." };
  }
  // Also after a failure: a state error (the booking already changed) means the screen is stale and must show the current state.
  revalidatePath("/app/bookings");
  revalidatePath(`/app/bookings/${bookingId}`);
  return outcome;
}

export async function approvePaymentAction(formData: FormData): Promise<ActionResult> {
  const v = readText(formData, ["bookingId", "paymentId", "fxRate"]);
  const parsed = approvePaymentSchema.safeParse(v);
  if (!parsed.success) return INVALID;
  return run((ctx) => approvePayment(ctx, parsed.data.paymentId, parsed.data.fxRate), parsed.data.bookingId);
}

export async function rejectPaymentAction(formData: FormData): Promise<ActionResult> {
  const v = readText(formData, ["bookingId", "paymentId", "reason"]);
  const parsed = rejectPaymentSchema.safeParse(v);
  if (!parsed.success) return INVALID;
  return run((ctx) => rejectPayment(ctx, parsed.data.paymentId, parsed.data.reason), parsed.data.bookingId);
}

export async function cancelBookingAction(formData: FormData): Promise<ActionResult> {
  const v = readText(formData, ["bookingId", "reason"]);
  const parsed = cancelBookingSchema.safeParse(v);
  if (!parsed.success) return INVALID;
  return run((ctx) => cancelBooking(ctx, parsed.data.bookingId, parsed.data.reason), parsed.data.bookingId);
}
