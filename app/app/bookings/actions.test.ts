import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
const dal = vi.hoisted(() => ({
  getBookingsContext: vi.fn(), approvePayment: vi.fn(), rejectPayment: vi.fn(), cancelBooking: vi.fn(),
}));
vi.mock("@/lib/dal/bookings", () => dal);
import { approvePaymentAction, cancelBookingAction, rejectPaymentAction } from "./actions";

const B = "b2060000-0000-4000-8000-000000000001";
const P = "b3060000-0000-4000-8000-000000000001";
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const ctx = { orgId: "org-1", supabase: {} };

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
    for (const bad of [{ paymentId: "nope", fxRate: "" }, { paymentId: P, fxRate: "-1" }, { paymentId: P, fxRate: "1e3" }]) {
      expect((await approvePaymentAction(form({ bookingId: B, ...bad }))).ok).toBe(false);
    }
    expect(dal.approvePayment).not.toHaveBeenCalled();
  });
  it("returns the DAL's Spanish error and does not refresh when the action failed", async () => {
    dal.approvePayment.mockResolvedValue({ ok: false, error: "La reserva ya cambió de estado." });
    expect(await approvePaymentAction(form({ bookingId: B, paymentId: P, fxRate: "" }))).toEqual({ ok: false, error: "La reserva ya cambió de estado." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("hides the thrown message when something unexpected happens", async () => {
    dal.approvePayment.mockRejectedValue(new Error("connection string postgres://user:pw@host"));
    const r = await approvePaymentAction(form({ bookingId: B, paymentId: P, fxRate: "" }));
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("postgres://");
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
