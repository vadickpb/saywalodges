import { describe, expect, it } from "vitest";
import { judge, migrationDate } from "./health-check.mjs";

const now = new Date("2026-11-03T12:00:00Z");
const okBody = { status: "ok", problems: [], lastMigration: "20261102200000" };
const ctx = { latestMigration: "20261102200000_health_snapshot.sql", now };

describe("judge", () => {
  it("is ok for a healthy, up-to-date installation", () => {
    expect(judge({ httpStatus: 200, body: okBody }, ctx)).toEqual({ ok: true, reasons: [] });
  });
  it("fails when there is no answer", () => {
    expect(judge({ httpStatus: null, body: null }, ctx).ok).toBe(false);
  });
  it("explains a 401 as a secret mismatch", () => {
    expect(judge({ httpStatus: 401, body: null }, ctx).reasons[0]).toMatch(/HEALTH_SECRET/);
  });
  it.each([404, 500, 502])("fails on unexpected HTTP %i", (s) => {
    expect(judge({ httpStatus: s, body: null }, ctx).ok).toBe(false);
  });
  it("turns problem codes into reasons", () => {
    const r = judge({ httpStatus: 503, body: { ...okBody, status: "degraded", problems: ["holds_not_expiring", "ical_sync_stalled"] } }, ctx);
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(2);
  });
  it("fails a 503 even if the problem is unknown, and a 200 that is not a report", () => {
    expect(judge({ httpStatus: 503, body: { status: "degraded", problems: [] } }, ctx).ok).toBe(false);
    expect(judge({ httpStatus: 200, body: { hello: "world" } }, ctx).ok).toBe(false);
    expect(judge({ httpStatus: 200, body: null }, ctx).ok).toBe(false);
  });
  it("tolerates a migration that is pending approval for less than 24 h", () => {
    const fresh = { latestMigration: "20261103090000_new.sql", now };
    expect(judge({ httpStatus: 200, body: okBody }, fresh).ok).toBe(true);
  });
  it("fails when the database is more than 24 h behind the repository", () => {
    const old = { latestMigration: "20261101090000_new.sql", now };
    const r = judge({ httpStatus: 200, body: { ...okBody, lastMigration: "20261030120000" } }, old);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/behind/);
  });
  it("does not compare migrations when the repository has none", () => {
    expect(judge({ httpStatus: 200, body: okBody }, { latestMigration: null, now }).ok).toBe(true);
  });
});

describe("untrusted response body", () => {
  it("never echoes a non-numeric lastMigration into the reasons (workflow-command injection)", () => {
    const evil = "1\n::add-mask::x";
    const r = judge({ httpStatus: 200, body: { ...okBody, lastMigration: evil } }, { latestMigration: "20261101090000_new.sql", now });
    expect(r.ok).toBe(false);
    expect(r.reasons.join("")).not.toContain("::");
    expect(r.reasons.join("")).toContain("applied none");
  });
});

describe("migrationDate", () => {
  it("parses a version prefix and rejects garbage", () => {
    expect(migrationDate("20261102200000_x.sql")?.toISOString()).toBe("2026-11-02T20:00:00.000Z");
    expect(migrationDate("nope")).toBeNull();
    expect(migrationDate(undefined)).toBeNull();
  });
});
