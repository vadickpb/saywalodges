import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/ical-cron", () => ({ claimAlert: vi.fn(), listDueFeedIds: vi.fn(), settleAlert: vi.fn(), syncDueFeed: vi.fn() }));
import { runScheduledIcalSync, type Deps, type Options } from "./scheduled-sync";
import type { AlertClaim } from "@/lib/dal/ical-cron";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `f0000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
const options: Options = { limit: 25, concurrency: 2, budgetMs: 1000, dashboardUrl: "https://app.example/app/calendar/feeds" };
const claim: AlertClaim = {
  claim_id: "c0000000-0000-4000-8000-000000000001",
  channel: "airbnb",
  unit_name: "Casa Saywa",
  count: 2,
  recipients: ["owner@example.com"],
};

function deps(over: Partial<Deps> = {}) {
  const d = {
    listDueFeedIds: vi.fn(async () => ids(3)),
    syncDueFeed: vi.fn(async () => "synced" as const),
    claimAlert: vi.fn(async () => null),
    settleAlert: vi.fn(async () => {}),
    sendEmail: vi.fn(async () => ({ ok: true as const, id: "re_1", simulated: false })),
    now: () => 0,
    ...over,
  };
  return d satisfies Deps;
}

describe("runScheduledIcalSync", () => {
  it("asks for at most `limit` feeds and syncs each one", async () => {
    const d = deps();
    const summary = await runScheduledIcalSync(options, d);
    expect(d.listDueFeedIds).toHaveBeenCalledWith(25);
    expect(d.syncDueFeed).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({ due: 3, synced: 3, failed: 0, deferred: 0 });
  });

  it("a failing or throwing feed does not stop the others", async () => {
    const list = ids(4);
    const d = deps({
      listDueFeedIds: vi.fn(async () => list),
      syncDueFeed: vi.fn(async (id: string) => {
        if (id === list[0]) throw new Error("boom with https://secret.example/feed.ics");
        if (id === list[1]) return "failed" as const;
        return "synced" as const;
      }),
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const summary = await runScheduledIcalSync(options, d);
    expect(d.syncDueFeed).toHaveBeenCalledTimes(4);
    expect(summary).toMatchObject({ synced: 2, failed: 2 });
    expect(spy.mock.calls.flat().join(" ")).not.toContain("secret.example");
    spy.mockRestore();
  });

  it("stops starting chunks once the time budget is spent and defers the rest", async () => {
    let clock = 0;
    const d = deps({
      listDueFeedIds: vi.fn(async () => ids(5)),
      syncDueFeed: vi.fn(async () => {
        clock += 600;
        return "synced" as const;
      }),
      now: () => clock,
    });
    const summary = await runScheduledIcalSync({ ...options, concurrency: 1 }, d);
    expect(d.syncDueFeed).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ due: 5, synced: 2, deferred: 3 });
  });

  it("does not alert for a feed whose lease another run holds", async () => {
    const d = deps({ syncDueFeed: vi.fn(async () => "skipped" as const) });
    const summary = await runScheduledIcalSync(options, d);
    expect(d.claimAlert).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(3);
  });

  it("sends nothing when the ledger has no new alert (dedupe)", async () => {
    const d = deps();
    const summary = await runScheduledIcalSync(options, d);
    expect(d.claimAlert).toHaveBeenCalledTimes(6); // conflict + feed_down for each of 3 feeds
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(summary.alertsSent).toBe(0);
  });

  it("emails the owner once per claim and marks it delivered, with no PII in the props", async () => {
    const list = ids(1);
    const d = deps({
      listDueFeedIds: vi.fn(async () => list),
      claimAlert: vi.fn(async (_id: string, kind: string) => (kind === "conflict" ? claim : null)),
    });
    const summary = await runScheduledIcalSync(options, d);
    expect(d.sendEmail).toHaveBeenCalledTimes(1);
    expect(d.sendEmail).toHaveBeenCalledWith({
      template: "icalConflict",
      lang: "es",
      to: "owner@example.com",
      idempotencyKey: `ical:${claim.claim_id}:0`,
      props: { channel: "airbnb", unitName: "Casa Saywa", url: options.dashboardUrl, count: 2 },
    });
    expect(d.settleAlert).toHaveBeenCalledWith(list[0], claim.claim_id, true);
    expect(summary.alertsSent).toBe(1);
  });

  it("sends the feed-down template for the feed_down claim", async () => {
    const d = deps({
      listDueFeedIds: vi.fn(async () => ids(1)),
      claimAlert: vi.fn(async (_id: string, kind: string) => (kind === "feed_down" ? claim : null)),
    });
    await runScheduledIcalSync(options, d);
    expect(vi.mocked(d.sendEmail).mock.calls[0][0]).toMatchObject({ template: "icalFeedDown" });
    expect(vi.mocked(d.sendEmail).mock.calls[0][0].props).not.toHaveProperty("count");
  });

  it("releases the claim when email is simulated or fails, so the alert is not lost", async () => {
    const simulated = deps({
      listDueFeedIds: vi.fn(async () => ids(1)),
      claimAlert: vi.fn(async (_id: string, kind: string) => (kind === "conflict" ? claim : null)),
      sendEmail: vi.fn(async () => ({ ok: true as const, id: "sim_1", simulated: true })),
    });
    const s1 = await runScheduledIcalSync(options, simulated);
    expect(simulated.settleAlert).toHaveBeenCalledWith(expect.any(String), claim.claim_id, false);
    expect(s1).toMatchObject({ alertsSimulated: 1, alertsSent: 0 });

    const failing = deps({
      listDueFeedIds: vi.fn(async () => ids(1)),
      claimAlert: vi.fn(async (_id: string, kind: string) => (kind === "conflict" ? claim : null)),
      sendEmail: vi.fn(async () => ({ ok: false as const, reason: "unavailable" as const })),
    });
    const s2 = await runScheduledIcalSync(options, failing);
    expect(failing.settleAlert).toHaveBeenCalledWith(expect.any(String), claim.claim_id, false);
    expect(s2).toMatchObject({ alertsFailed: 1, alertsSent: 0 });
  });

  it("an alert error on one feed does not stop the other feeds", async () => {
    const list = ids(2);
    const d = deps({
      listDueFeedIds: vi.fn(async () => list),
      claimAlert: vi.fn(async (id: string) => {
        if (id === list[0]) throw new Error("db down");
        return null;
      }),
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const summary = await runScheduledIcalSync(options, d);
    expect(d.claimAlert).toHaveBeenCalledWith(list[1], "conflict");
    expect(summary.synced).toBe(2);
    spy.mockRestore();
  });
});
