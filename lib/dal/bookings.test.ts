import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./organizations", () => ({ requireActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { approvePayment, cancelBooking, getBookingDetail, listBookings, rejectPayment } from "./bookings";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";
type Result = { data: unknown; error: { code?: string } | null; count?: number };

// A chainable, awaitable stand-in for a PostgREST query: every method returns the same object and awaiting it yields the result.
function query(result: Result) {
  const calls: Array<[string, unknown[]]> = [];
  const q: Record<string, unknown> = {
    then: (resolve: (r: Result) => unknown) => resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  for (const m of ["select", "eq", "in", "gte", "lte", "order", "range", "limit"]) {
    q[m] = (...args: unknown[]) => { calls.push([m, args]); return q; };
  }
  return { q, calls };
}
function client(tables: Record<string, Result>, rpcResult: { error: { code?: string } | null } = { error: null }) {
  const used: Record<string, ReturnType<typeof query>> = {};
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const supabase = { from: (t: string) => (used[t] = query(tables[t] ?? { data: [], error: null })).q, rpc };
  return { ctx: { supabase: supabase as never, orgId: ORG, isOwner: true }, used, rpc };
}

const booking = { id: "b1", status: "pending_payment", check_in: "2026-12-01", check_out: "2026-12-03", guests: 2, currency: "USD", total_cents: 60000, deposit_cents: 30000, expires_at: "2026-11-05T00:00:00Z", created_at: "2026-11-03T00:00:00Z", unit_id: "u1", guest_id: "g1" };

describe("listBookings", () => {
  it("scopes every read to the organization and maps names and the voucher-to-review flag", async () => {
    const c = client({
      bookings: { data: [booking], error: null, count: 1 },
      guests: { data: [{ id: "g1", name: "Ana" }], error: null },
      units: { data: [{ id: "u1", name: "Suite" }], error: null },
      payments: { data: [{ booking_id: "b1" }], error: null },
    });
    const { rows, total } = await listBookings(c.ctx, { filter: "all", from: null, to: null, page: 1 });
    expect(total).toBe(1);
    expect(rows[0]).toMatchObject({ id: "b1", guestName: "Ana", unitName: "Suite", hasVoucherToReview: true, depositCents: 30000 });
    for (const t of ["bookings", "guests", "units", "payments"]) expect(c.used[t].calls).toContainEqual(["eq", ["org_id", ORG]]);
  });
  it("applies the status and arrival-date filters and the page window", async () => {
    const c = client({ bookings: { data: [], error: null, count: 0 } });
    await listBookings(c.ctx, { filter: "confirmed", from: "2026-12-01", to: "2026-12-31", page: 3 });
    const calls = c.used.bookings.calls;
    expect(calls).toContainEqual(["eq", ["status", "confirmed"]]);
    expect(calls).toContainEqual(["gte", ["check_in", "2026-12-01"]]);
    expect(calls).toContainEqual(["lte", ["check_in", "2026-12-31"]]);
    expect(calls).toContainEqual(["range", [40, 59]]);
  });
  it("'needs_review' is ONE query: pending bookings joined to a payment under review (no id list in the URL, no cap)", async () => {
    const c = client({ bookings: { data: [], error: null, count: 0 } });
    await listBookings(c.ctx, { filter: "needs_review", from: null, to: null, page: 1 });
    expect(c.used.payments).toBeUndefined();
    expect(c.used.bookings.calls).toContainEqual(["select", [expect.stringContaining("payments!inner(id)"), { count: "exact" }]]);
    expect(c.used.bookings.calls).toContainEqual(["eq", ["payments.status", "pending_review"]]);
    expect(c.used.bookings.calls).toContainEqual(["eq", ["status", "pending_payment"]]);
  });
  it("a page past the end reports the real total instead of failing, so the screen can go to the last page", async () => {
    let call = 0;
    const out = { data: null, error: { code: "PGRST103" } as { code?: string }, count: undefined };
    const head = { data: null, error: null, count: 45 };
    const used: ReturnType<typeof query>[] = [];
    const supabase = { from: () => { const r = query(call++ === 0 ? out : head); used.push(r); return r.q; }, rpc: vi.fn() };
    const res = await listBookings({ supabase: supabase as never, orgId: ORG, isOwner: true }, { filter: "all", from: null, to: null, page: 99 });
    expect(res).toEqual({ rows: [], total: 45 });
    expect(used[1].calls).toContainEqual(["select", ["id", { count: "exact", head: true }]]);
  });
  it("fails with a generic message and no database text", async () => {
    const c = client({ bookings: { data: null, error: { code: "XX000" } } });
    await expect(listBookings(c.ctx, { filter: "all", from: null, to: null, page: 1 })).rejects.toThrow("No se pudieron cargar las reservas. Intenta de nuevo.");
  });
});

describe("getBookingDetail", () => {
  it("returns null when the booking is not visible to the organization", async () => {
    const c = client({ bookings: { data: null, error: null } });
    expect(await getBookingDetail(c.ctx, "b1")).toBeNull();
    expect(c.used.bookings.calls).toContainEqual(["eq", ["org_id", ORG]]);
  });
  it("never exposes the voucher path, only whether there is one", async () => {
    const c = client({
      bookings: { data: { ...booking, confirmed_at: null, cancelled_at: null, cancel_reason: null }, error: null },
      guests: { data: { name: "Ana", email: "a@x.pe", phone: null }, error: null },
      units: { data: { name: "Suite" }, error: null },
      payments: { data: [{ id: "p1", status: "pending_review", method: "yape", amount_cents: 30000, currency: "USD", reference: "Op 1", voucher_path: "org/token/file.png", reject_reason: null, created_at: "2026-11-03T01:00:00Z", reviewed_at: null }], error: null },
    });
    const d = await getBookingDetail(c.ctx, "b1");
    expect(d?.payments[0]).toMatchObject({ id: "p1", hasVoucher: true, status: "pending_review" });
    expect(JSON.stringify(d)).not.toContain("org/token/file.png");
    expect(d?.hasVoucherToReview).toBe(true);
  });
});

describe("actions", () => {
  it("call the membership-checked RPCs with the verified organization, never one from the caller", async () => {
    const c = client({});
    await approvePayment(c.ctx, "p1", 3.75);
    await rejectPayment(c.ctx, "p1", "borroso");
    await cancelBooking(c.ctx, "b1", "");
    expect(c.rpc).toHaveBeenNthCalledWith(1, "confirm_payment", { p_org_id: ORG, p_payment_id: "p1", p_fx_rate_pen: 3.75 });
    expect(c.rpc).toHaveBeenNthCalledWith(2, "reject_payment", { p_org_id: ORG, p_payment_id: "p1", p_reason: "borroso" });
    expect(c.rpc).toHaveBeenNthCalledWith(3, "cancel_booking", { p_org_id: ORG, p_booking_id: "b1", p_reason: undefined });
  });
  it("omits the exchange rate when none was typed", async () => {
    const c = client({});
    await approvePayment(c.ctx, "p1", null);
    expect(c.rpc).toHaveBeenCalledWith("confirm_payment", { p_org_id: ORG, p_payment_id: "p1", p_fx_rate_pen: undefined });
  });
  it("turn database errors into a Spanish message without leaking the database text", async () => {
    const c = client({}, { error: { code: "55000", message: "cannot confirm payment approved of booking cancelled" } as never });
    const r = await approvePayment(c.ctx, "p1", null);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("cambió de estado") });
    expect(JSON.stringify(r)).not.toContain("cannot confirm");
    const missingFx = client({}, { error: { code: "22023" } });
    expect(await approvePayment(missingFx.ctx, "p1", null)).toEqual({ ok: false, error: expect.stringContaining("tipo de cambio") });
  });
});
