import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const getHealthSnapshot = vi.fn();
vi.mock("@/lib/dal/health", () => ({ getHealthSnapshot: () => getHealthSnapshot() }));
const envMock = vi.hoisted(() => ({}) as { HEALTH_SECRET?: string });
vi.mock("@/lib/env", () => ({ env: envMock }));
import { GET } from "./route";

const SECRET = "h".repeat(48);
const req = (auth?: string) => new Request("http://localhost:3000/api/health", { headers: auth ? { authorization: auth } : {} });
const snap = { last_migration: "20261102200000", overdue_holds: 0, stale_feeds: 0, failing_feeds: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  envMock.HEALTH_SECRET = SECRET;
});

describe("GET /api/health", () => {
  it("answers 200 with a closed report when healthy", async () => {
    getHealthSnapshot.mockResolvedValue(snap);
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", problems: [], lastMigration: "20261102200000" });
    expect(Object.keys(body).sort()).toEqual(["checks", "lastMigration", "problems", "status", "version"]);
  });

  it("answers 503 with problem codes when degraded", async () => {
    getHealthSnapshot.mockResolvedValue({ ...snap, overdue_holds: 3, stale_feeds: 1 });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect((await res.json()).problems).toEqual(["holds_not_expiring", "ical_sync_stalled"]);
  });

  it("answers a generic 500 (no details) when the check itself fails", async () => {
    getHealthSnapshot.mockRejectedValue(new Error("connection string postgres://user:pw@host"));
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('{"error":"internal"}');
  });

  it("never touches the database without a valid secret, and answers a bare 401", async () => {
    for (const auth of [undefined, "Bearer wrong", `Bearer ${SECRET}x`, "Basic abc"]) {
      const res = await GET(req(auth));
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("");
    }
    expect(getHealthSnapshot).not.toHaveBeenCalled();
  });

  it("refuses everyone when HEALTH_SECRET is unset or short, even for an empty bearer", async () => {
    for (const secret of [undefined, "short"]) {
      if (secret === undefined) delete envMock.HEALTH_SECRET;
      else envMock.HEALTH_SECRET = secret;
      for (const auth of [undefined, "Bearer ", "Bearer undefined", `Bearer ${secret}`]) {
        expect((await GET(req(auth))).status).toBe(401);
      }
    }
    expect(getHealthSnapshot).not.toHaveBeenCalled();
  });

  it("does not accept CRON_SECRET (separate secrets)", async () => {
    getHealthSnapshot.mockResolvedValue(snap);
    envMock.HEALTH_SECRET = SECRET;
    expect((await GET(req(`Bearer ${"c".repeat(48)}`))).status).toBe(401);
  });
});
