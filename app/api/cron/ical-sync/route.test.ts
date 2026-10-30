import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const run = vi.fn();
vi.mock("@/lib/ical/scheduled-sync", () => ({ runScheduledIcalSync: (...args: unknown[]) => run(...args) }));
const envMock = vi.hoisted(() => ({ ROOT_DOMAIN: "saywa.example" }) as { CRON_SECRET?: string; ROOT_DOMAIN: string });
vi.mock("@/lib/env", () => ({ env: envMock }));
import { GET, POST } from "./route";

const SECRET = "c".repeat(48);
const req = (auth?: string, method = "GET") =>
  new Request("http://localhost:3000/api/cron/ical-sync", { method, headers: auth ? { authorization: auth } : {} });
const summary = { due: 2, synced: 1, failed: 1, skipped: 0, deferred: 0, alertsSent: 0, alertsSimulated: 0, alertsFailed: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  envMock.CRON_SECRET = SECRET;
  envMock.ROOT_DOMAIN = "saywa.example";
});

describe("/api/cron/ical-sync", () => {
  it("runs a bounded batch with the right secret and returns the summary", async () => {
    run.mockResolvedValue(summary);
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(summary);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(run).toHaveBeenCalledWith({
      limit: 25,
      concurrency: 5,
      budgetMs: 45_000,
      dashboardUrl: "https://app.saywa.example/app/calendar/feeds",
    });
    expect((await POST(req(`Bearer ${SECRET}`, "POST"))).status).toBe(200);
  });

  it("omits the dashboard link outside https (local dev)", async () => {
    run.mockResolvedValue(summary);
    envMock.ROOT_DOMAIN = "localhost:3000";
    await GET(req(`Bearer ${SECRET}`));
    expect(run.mock.calls[0][0]).not.toHaveProperty("dashboardUrl");
  });

  it("answers a bare 401 and runs nothing without a valid secret", async () => {
    for (const auth of [undefined, "Bearer wrong", `Bearer ${SECRET}x`, SECRET]) {
      const res = await GET(req(auth));
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("");
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is unset or too short", async () => {
    delete envMock.CRON_SECRET;
    for (const auth of [undefined, "Bearer ", "Bearer undefined"]) expect((await GET(req(auth))).status).toBe(401);
    envMock.CRON_SECRET = "short";
    expect((await GET(req("Bearer short"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("hides failure detail behind a generic 500 and logs no message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    run.mockRejectedValue(new Error('relation "ical_feeds" secret https://ical.example/x'));
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toBe('{"error":"internal"}');
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).toContain("cron.ical_sync.failed");
    expect(logged).not.toContain("secret");
    spy.mockRestore();
  });
});
