import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
const dal = vi.hoisted(() => ({
  getBookingsContext: vi.fn(), approvePayment: vi.fn(), rejectPayment: vi.fn(), cancelBooking: vi.fn(), createManualBooking: vi.fn(), recordManualPayment: vi.fn(),
}));
vi.mock("@/lib/dal/bookings", () => dal);
import { approvePaymentAction, cancelBookingAction, createManualBookingAction, recordManualPaymentAction, rejectPaymentAction } from "./actions";

const B = "b2060000-0000-4000-8000-000000000001";
const P = "b3060000-0000-4000-8000-000000000001";
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const ctx = { orgId: "org-1", supabase: {}, isOwner: true };

beforeEach(() => {
  vi.clearAllMocks();
  dal.getBookingsContext.mockResolvedValue(ctx);
});

describe("approvePaymentAction", () => {
  it("validates, calls the DAL with the parsed values and refreshes both screens on success", async () => {
    dal.approvePayment.mockResolvedValue({ ok: true });
    expect(await approvePaymentAction(form({ bookingId: B, paymentId: P, fxRate: "3.75" }))).toEqual({ ok: true });
    expect(dal.approvePayment).toHaveBeenCalledWith(ctx, P, 3.75);
    expect(revalidatePath).toHaveBeenCalledWith("/app/bookings");
    expect(revalidatePath).toHaveBeenCalledWith(`/app/bookings/${B}`);
  });
  it("treats an empty rate as none, and refuses a malformed id or rate before touching anything", async () => {
    dal.approvePayment.mockResolvedValue({ ok: true });
    await approvePaymentAction(form({ bookingId: B, paymentId: P, fxRate: "" }));
    expect(dal.approvePayment).toHaveBeenCalledWith(ctx, P, null);
    dal.approvePayment.mockClear();
    for (const bad of [{ paymentId: "nope", fxRate: "" }, { paymentId: P, fxRate: "-1" }, { paymentId: P, fxRate: "1e3" }, { paymentId: P, fxRate: "100" }]) {
      expect((await approvePaymentAction(form({ bookingId: B, ...bad }))).ok).toBe(false);
    }
    expect(dal.approvePayment).not.toHaveBeenCalled();
  });
  it("returns the DAL's Spanish error and still refreshes the screens, which are stale if the booking changed", async () => {
    dal.approvePayment.mockResolvedValue({ ok: false, error: "La reserva ya cambió de estado." });
    expect(await approvePaymentAction(form({ bookingId: B, paymentId: P, fxRate: "" }))).toEqual({ ok: false, error: "La reserva ya cambió de estado." });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/bookings/${B}`);
  });
  it("never builds a revalidation path from an unvalidated booking id", async () => {
    for (const bookingId of ["../../x", "", "a/b"]) {
      expect((await approvePaymentAction(form({ bookingId, paymentId: P, fxRate: "" }))).ok).toBe(false);
      expect((await rejectPaymentAction(form({ bookingId, paymentId: P, reason: "" }))).ok).toBe(false);
    }
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(dal.approvePayment).not.toHaveBeenCalled();
  });
  it("hides the thrown message when something unexpected happens", async () => {
    dal.approvePayment.mockRejectedValue(new Error("connection string postgres://user:pw@host"));
    const r = await approvePaymentAction(form({ bookingId: B, paymentId: P, fxRate: "" }));
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("postgres://");
  });
  it("refuses staff before calling the DAL (the database refuses them too)", async () => {
    dal.getBookingsContext.mockResolvedValue({ ...ctx, isOwner: false });
    const denied = { ok: false, error: "Solo el dueño puede aprobar, rechazar o cancelar reservas." };
    expect(await approvePaymentAction(form({ bookingId: B, paymentId: P, fxRate: "" }))).toEqual(denied);
    expect(await rejectPaymentAction(form({ bookingId: B, paymentId: P, reason: "" }))).toEqual(denied);
    expect(await cancelBookingAction(form({ bookingId: B, reason: "" }))).toEqual(denied);
    expect(dal.approvePayment).not.toHaveBeenCalled();
    expect(dal.rejectPayment).not.toHaveBeenCalled();
    expect(dal.cancelBooking).not.toHaveBeenCalled();
  });
  it("does nothing without an active organization", async () => {
    dal.getBookingsContext.mockResolvedValue(null);
    expect(await approvePaymentAction(form({ bookingId: B, paymentId: P, fxRate: "" }))).toEqual({ ok: false, error: "No hay una organización activa." });
    expect(dal.approvePayment).not.toHaveBeenCalled();
  });
});

describe("rejectPaymentAction / cancelBookingAction", () => {
  it("reject passes a trimmed reason; control and direction characters are refused", async () => {
    dal.rejectPayment.mockResolvedValue({ ok: true });
    await rejectPaymentAction(form({ bookingId: B, paymentId: P, reason: "  borroso  " }));
    expect(dal.rejectPayment).toHaveBeenCalledWith(ctx, P, "borroso");
    dal.rejectPayment.mockClear();
    for (const reason of ["a\nb", "x‮y", "a".repeat(501)]) {
      expect((await rejectPaymentAction(form({ bookingId: B, paymentId: P, reason }))).ok).toBe(false);
    }
    expect(dal.rejectPayment).not.toHaveBeenCalled();
  });
  it("cancel validates the id and the reason, and refreshes the booking on success", async () => {
    dal.cancelBooking.mockResolvedValue({ ok: true });
    expect(await cancelBookingAction(form({ bookingId: B, reason: "" }))).toEqual({ ok: true });
    expect(dal.cancelBooking).toHaveBeenCalledWith(ctx, B, "");
    expect(revalidatePath).toHaveBeenCalledWith(`/app/bookings/${B}`);
    dal.cancelBooking.mockClear();
    expect((await cancelBookingAction(form({ bookingId: "x", reason: "" }))).ok).toBe(false);
    expect(dal.cancelBooking).not.toHaveBeenCalled();
  });
});

describe("manual booking and payment", () => {
  const U = "ee204001-0000-4000-8000-000000000001";
  const PID = "a4130000-0000-4000-8000-000000000001";
  const booking = { unitId: U, checkIn: "2030-01-10", checkOut: "2030-01-12", guests: "2", name: "Ana", email: "ana@example.com", phone: "", lang: "es" };
  it("creates a booking from validated input only (no price anywhere) and refreshes the list", async () => {
    dal.createManualBooking.mockResolvedValue({ ok: true, bookingId: B });
    expect(await createManualBookingAction(form(booking))).toEqual({ ok: true, bookingId: B });
    expect(dal.createManualBooking).toHaveBeenCalledWith(ctx, expect.objectContaining({ unitId: U, guests: 2, email: "ana@example.com" }));
    expect(JSON.stringify(dal.createManualBooking.mock.calls[0][1])).not.toMatch(/total|price|amount/i);
    expect(revalidatePath).toHaveBeenCalledWith("/app/bookings");
  });
  it("refuses invalid input and staff before touching the DAL", async () => {
    dal.createManualBooking.mockClear();
    expect((await createManualBookingAction(form({ ...booking, email: "x" }))).ok).toBe(false);
    dal.getBookingsContext.mockResolvedValue({ ...ctx, isOwner: false });
    expect(await createManualBookingAction(form(booking))).toEqual({ ok: false, error: "Solo el dueño puede aprobar, rechazar o cancelar reservas." });
    expect(await recordManualPaymentAction(form({ bookingId: B, paymentId: PID, amount: "10", method: "cash", reference: "", fxRate: "" }))).toMatchObject({ ok: false });
    expect(dal.createManualBooking).not.toHaveBeenCalled();
    expect(dal.recordManualPayment).not.toHaveBeenCalled();
  });
  it("registers a payment in cents with the idempotency id and refreshes the booking", async () => {
    dal.recordManualPayment.mockResolvedValue({ ok: true, replayed: false });
    expect(await recordManualPaymentAction(form({ bookingId: B, paymentId: PID, amount: "150,50", method: "yape", reference: "r1", fxRate: "3.75" }))).toEqual({ ok: true });
    expect(dal.recordManualPayment).toHaveBeenCalledWith(ctx, expect.objectContaining({ bookingId: B, paymentId: PID, amount: 15050, method: "yape", fxRate: 3.75 }));
    expect(revalidatePath).toHaveBeenCalledWith(`/app/bookings/${B}`);
  });
});
