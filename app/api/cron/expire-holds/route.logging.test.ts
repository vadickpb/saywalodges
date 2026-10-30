import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "s".repeat(40);
const expireHolds = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s".repeat(40) } }));
vi.mock("@/lib/dal/booking-holds", () => ({ expireHolds: () => expireHolds() }));

import { GET, POST } from "./route";

let lines: string[];
beforeEach(() => {
  lines = [];
  expireHolds.mockReset();
  for (const sink of ["log", "warn", "error"] as const) {
    vi.spyOn(console, sink).mockImplementation((line: string) => void lines.push(line));
  }
});
afterEach(() => vi.restoreAllMocks());

const call = (authorization?: string, handler = POST) =>
  handler(new Request("https://example.test/api/cron/expire-holds?probe=1", { method: "POST", headers: authorization ? { authorization } : {} }));
const events = () => lines.map((l) => JSON.parse(l));

describe("/api/cron/expire-holds observability", () => {
  it("logs a 401 without running the job or leaking the header", async () => {
    const res = await call("Bearer wrong-wrong-wrong-wrong-wrong-wrong-wrong");
    expect(res.status).toBe(401);
    expect(expireHolds).not.toHaveBeenCalled();
    expect(events()).toMatchObject([{ level: "warn", event: "cron.expire_holds.unauthorized", status: 401, method: "POST" }]);
    expect(lines.join()).not.toMatch(/wrong-wrong|probe|Bearer/);
    expect(res.headers.get("x-request-id")).toBe(events()[0].requestId);
  });

  it("logs a 401 when the header is missing", async () => {
    expect((await call()).status).toBe(401);
    expect(events()[0].event).toBe("cron.expire_holds.unauthorized");
  });

  it("logs success with the count only", async () => {
    expireHolds.mockResolvedValue(4);
    const res = await call(`Bearer ${SECRET}`, GET);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ expired: 4 });
    expect(events()).toMatchObject([{ level: "info", event: "cron.expire_holds.completed", status: 200, count: 4 }]);
    expect(lines.join()).not.toContain(SECRET);
  });

  it("logs a 500 with the error class only, never its message", async () => {
    expireHolds.mockRejectedValue(new Error("connection to db.secret-host.supabase.co failed for guest@example.com"));
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
    expect(events()).toMatchObject([{ level: "error", event: "cron.expire_holds.failed", status: 500, errorName: "Error" }]);
    expect(lines.join()).not.toMatch(/secret-host|guest@|supabase\.co|Bearer/);
    expect(lines.join()).not.toContain(SECRET);
  });
});
