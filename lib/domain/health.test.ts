import { describe, expect, it } from "vitest";
import { evaluateHealth, healthSnapshotSchema, shortVersion } from "./health";

const ok = { last_migration: "20261102200000", overdue_holds: 0, stale_feeds: 0, failing_feeds: 0 };

describe("evaluateHealth", () => {
  it("is ok when nothing is overdue or stale", () => {
    expect(evaluateHealth(ok, "abcdef1234567890")).toEqual({
      status: "ok", problems: [], version: "abcdef1", lastMigration: "20261102200000",
      checks: { overdueHolds: 0, staleFeeds: 0, failingFeeds: 0 },
    });
  });
  it("flags holds that are not expiring", () => {
    expect(evaluateHealth({ ...ok, overdue_holds: 2 })).toMatchObject({ status: "degraded", problems: ["holds_not_expiring"] });
  });
  it("flags a stalled iCal sync", () => {
    expect(evaluateHealth({ ...ok, stale_feeds: 1 })).toMatchObject({ status: "degraded", problems: ["ical_sync_stalled"] });
  });
  it("reports both problems", () => {
    expect(evaluateHealth({ ...ok, overdue_holds: 1, stale_feeds: 1 }).problems).toEqual(["holds_not_expiring", "ical_sync_stalled"]);
  });
  it("does not degrade on failing feeds alone (channel-side problem)", () => {
    expect(evaluateHealth({ ...ok, failing_feeds: 5 })).toMatchObject({ status: "ok", checks: { failingFeeds: 5 } });
  });
});

describe("shortVersion", () => {
  it("shortens a commit sha and rejects anything else", () => {
    expect(shortVersion("ABCDEF1234567")).toBe("abcdef1");
    expect(shortVersion(undefined)).toBeNull();
    expect(shortVersion("not a sha")).toBeNull();
    expect(shortVersion("abc")).toBeNull();
  });
});

describe("healthSnapshotSchema", () => {
  it("accepts the database shape, with a null migration", () => {
    expect(healthSnapshotSchema.safeParse({ ...ok, last_migration: null }).success).toBe(true);
  });
  it.each([
    [{ ...ok, overdue_holds: -1 }],
    [{ ...ok, stale_feeds: 1.5 }],
    [{ ...ok, last_migration: "latest" }],
    [{ overdue_holds: 0 }],
    ["nope"],
  ])("rejects a malformed snapshot %#", (bad) => {
    expect(healthSnapshotSchema.safeParse(bad).success).toBe(false);
  });
});
