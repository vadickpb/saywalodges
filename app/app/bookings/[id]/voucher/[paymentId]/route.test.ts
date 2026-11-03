import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const dal = vi.hoisted(() => ({ getBookingsContext: vi.fn(), getVoucherSignedUrl: vi.fn() }));
vi.mock("@/lib/dal/bookings", () => ({ getBookingsContext: dal.getBookingsContext }));
vi.mock("@/lib/dal/payment-vouchers", () => ({ getVoucherSignedUrl: dal.getVoucherSignedUrl }));
import { GET } from "./route";

const B = "b2060000-0000-4000-8000-000000000001";
const P = "b3060000-0000-4000-8000-000000000001";
const call = (id: string, paymentId: string, qs = "") =>
  GET(new Request(`http://app.localhost:3000/app/bookings/${id}/voucher/${paymentId}${qs}`), { params: Promise.resolve({ id, paymentId }) });
const ctx = { supabase: {}, orgId: "org-1" };

beforeEach(() => {
  vi.clearAllMocks();
  dal.getBookingsContext.mockResolvedValue(ctx);
});

describe("voucher route", () => {
  it("redirects a member to the signed URL, uncached and without a referrer", async () => {
    dal.getVoucherSignedUrl.mockResolvedValue("https://x.supabase.co/signed?token=abc");
    const res = await call(B, P);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://x.supabase.co/signed?token=abc");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(dal.getVoucherSignedUrl).toHaveBeenCalledWith(ctx.supabase, "org-1", P, { bookingId: B, download: false });
  });
  it("asks for an attachment only with descargar=1", async () => {
    dal.getVoucherSignedUrl.mockResolvedValue("https://x/signed");
    await call(B, P, "?descargar=1");
    expect(dal.getVoucherSignedUrl).toHaveBeenCalledWith(ctx.supabase, "org-1", P, { bookingId: B, download: true });
    await call(B, P, "?descargar=yes");
    expect(dal.getVoucherSignedUrl).toHaveBeenLastCalledWith(ctx.supabase, "org-1", P, { bookingId: B, download: false });
  });
  it("answers the same bare 404 for a malformed id, an unknown payment, no organization, or any failure", async () => {
    dal.getVoucherSignedUrl.mockResolvedValue(null);
    const cases: Array<() => Promise<Response>> = [
      () => call("nope", P),
      () => call(B, "../../etc/passwd"),
      () => call(B, P),
      async () => { dal.getBookingsContext.mockResolvedValue(null); return call(B, P); },
      async () => { dal.getBookingsContext.mockRejectedValue(new Error("NEXT_REDIRECT")); return call(B, P); },
      async () => { dal.getBookingsContext.mockResolvedValue(ctx); dal.getVoucherSignedUrl.mockRejectedValue(new Error("storage down")); return call(B, P); },
    ];
    for (const run of cases) {
      const res = await run();
      expect(res.status).toBe(404);
      expect(res.headers.get("location")).toBeNull();
      expect(await res.text()).toBe("");
    }
  });
});
