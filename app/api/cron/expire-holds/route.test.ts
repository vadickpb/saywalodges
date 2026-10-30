import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const expireHolds = vi.fn();
vi.mock("@/lib/dal/booking-holds", () => ({ expireHolds: () => expireHolds() }));
const envMock = vi.hoisted(() => ({}) as { CRON_SECRET?: string });
vi.mock("@/lib/env", () => ({ env: envMock }));
import { GET, POST } from "./route";

const SECRET = "c".repeat(48);
const req = (auth?: string, method = "GET") =>
  new Request("http://localhost:3000/api/cron/expire-holds", { method, headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  envMock.CRON_SECRET = SECRET;
});

describe("/api/cron/expire-holds", () => {
  it("runs the sweep with the right secret and reports the count", async () => {
    expireHolds.mockResolvedValue(3);
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ expired: 3 });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await POST(req(`Bearer ${SECRET}`, "POST"))).status).toBe(200);
  });

  it("never runs the sweep without a valid secret", async () => {
    for (const auth of [undefined, "Bearer wrong", `Bearer ${SECRET}x`]) {
      const res = await GET(req(auth));
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("");
    }
    expect(expireHolds).not.toHaveBeenCalled();
  });

  it("never runs the sweep when CRON_SECRET is unset, even for an empty or guessed bearer", async () => {
    delete envMock.CRON_SECRET;
    for (const auth of [undefined, "Bearer ", "Bearer undefined"]) {
      expect((await GET(req(auth))).status).toBe(401);
    }
    expect(expireHolds).not.toHaveBeenCalled();
  });

  it("hides the failure detail behind a generic 500", async () => {
    expireHolds.mockRejectedValue(new Error('relation "bookings" secret detail'));
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret detail");
  });
});
