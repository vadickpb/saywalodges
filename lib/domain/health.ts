import { z } from "zod";

// Pure side of the installation health check (SD-1004). The database computes the figures with its own
// clock (public.health_snapshot); this decides what they mean. No I/O.

export const healthSnapshotSchema = z.object({
  last_migration: z.string().regex(/^\d{14}$/).nullable(),
  overdue_holds: z.number().int().nonnegative(),
  stale_feeds: z.number().int().nonnegative(),
  failing_feeds: z.number().int().nonnegative(),
});
export type HealthSnapshot = z.infer<typeof healthSnapshotSchema>;

export type HealthProblem = "holds_not_expiring" | "ical_sync_stalled";

export type HealthReport = {
  status: "ok" | "degraded";
  // Closed set of codes: the monitor and the e-mail alert only ever see these words.
  problems: HealthProblem[];
  version: string | null;
  lastMigration: string | null;
  checks: {
    overdueHolds: number;
    staleFeeds: number;
    // Informational: a failing feed is usually the channel's URL, not this installation's fault.
    failingFeeds: number;
  };
};

/** First 7 chars of the deployed commit, or null when the platform does not provide one. */
export function shortVersion(commitSha: string | undefined): string | null {
  return commitSha && /^[0-9a-f]{7,40}$/i.test(commitSha) ? commitSha.slice(0, 7).toLowerCase() : null;
}

export function evaluateHealth(snapshot: HealthSnapshot, commitSha?: string): HealthReport {
  const problems: HealthProblem[] = [];
  if (snapshot.overdue_holds > 0) problems.push("holds_not_expiring");
  if (snapshot.stale_feeds > 0) problems.push("ical_sync_stalled");
  return {
    status: problems.length === 0 ? "ok" : "degraded",
    problems,
    version: shortVersion(commitSha),
    lastMigration: snapshot.last_migration,
    checks: { overdueHolds: snapshot.overdue_holds, staleFeeds: snapshot.stale_feeds, failingFeeds: snapshot.failing_feeds },
  };
}
