import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ secret: "s3cret-s3cret-s3cret" as string | undefined, ip: "203.0.113.7" }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ rpc }) }));
vi.mock("@/lib/env", () => ({ env: { get CRON_SECRET() { return state.secret; } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-vercel-forwarded-for": state.ip }) }));
import { allowPublicRequest, clientIpFrom, rateKey } from "./rate-limit";

beforeEach(() => { rpc.mockReset(); state.secret = "s3cret-s3cret-s3cret"; state.ip = "203.0.113.7"; });

describe("clientIpFrom", () => {
  it("trusts the Vercel header only on Vercel and takes the first address", () => {
    expect(clientIpFrom(new Headers({ "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }), true)).toBe("1.2.3.4");
    expect(clientIpFrom(new Headers({ "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }), false)).toBe("9.9.9.9");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
  });
  it("keys IPv6 on the /64 prefix, expanding ::", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "2001:db8:1:2:aaaa:bbbb:cccc:dddd" }), false)).toBe("2001:0db8:0001:0002::/64");
    expect(clientIpFrom(new Headers({ "x-real-ip": "2001:db8:1:2::9" }), false)).toBe("2001:0db8:0001:0002::/64");
    expect(clientIpFrom(new Headers({ "x-real-ip": "2001:db8::1" }), false)).toBe("2001:0db8:0000:0000::/64");
  });
  it("falls back to a shared bucket for missing or malformed values", () => {
    expect(clientIpFrom(new Headers())).toBe("unknown");
    expect(clientIpFrom(new Headers({ "x-real-ip": "<script>" }))).toBe("unknown");
  });
});

describe("rateKey", () => {
  it("is a stable HMAC that hides the value and is case-insensitive", () => {
    const a = rateKey("k", "quote", "Guest@Example.com");
    expect(a).toBe(rateKey("k", "quote", "guest@example.com"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("example");
    expect(a).not.toBe(rateKey("other", "quote", "guest@example.com"));
  });
});

describe("allowPublicRequest", () => {
  it("allows while the database says yes and sends only the hashed key", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await allowPublicRequest("quote")).toBe(true);
    const args = rpc.mock.calls[0][1];
    expect(args).toMatchObject({ p_scope: "quote", p_limit: 30, p_window_seconds: 600 });
    expect(JSON.stringify(args)).not.toContain("203.0.113.7");
  });
  it("blocks when the limit is exceeded", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await allowPublicRequest("voucher")).toBe(false);
  });
  it("checkout also spends the per-email budget, and a blocked email stops it", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect(await allowPublicRequest("checkout", "guest@example.com")).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("guest@example.com");
  });
  it("fails open on a counter outage or a malformed answer", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "db down at host x" } });
    expect(await allowPublicRequest("quote")).toBe(true);
    rpc.mockResolvedValue({ data: "no", error: null });
    expect(await allowPublicRequest("quote")).toBe(true);
  });
  it("does nothing with a missing or too short secret (local dev)", async () => {
    state.secret = undefined;
    expect(await allowPublicRequest("quote")).toBe(true);
    state.secret = "short";
    expect(await allowPublicRequest("quote")).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
});
