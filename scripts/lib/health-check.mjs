// Decision logic of the scheduled installation monitor (SD-1004). Pure: no network, no clock of its own.
// The monitor turns an HTTP answer from /api/health into "ok" or a list of reasons; any reason fails the
// workflow run, and GitHub e-mails the failed run to the repository owner.

const PROBLEM_TEXT = {
  holds_not_expiring: "the expire-holds cron is not running (holds are past their expiry)",
  ical_sync_stalled: "the ical-sync cron is not running (feeds have not been attempted for over an hour)",
};

// A migration merged to main waits for the owner's approval in Actions; do not nag during that window.
export const MIGRATION_GRACE_MS = 24 * 60 * 60 * 1000;

/** "20261102200000_x.sql" → Date(UTC) of that version, or null. */
export function migrationDate(version) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(version ?? "");
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
}

/**
 * @param {{ httpStatus: number | null, body: unknown }} answer  httpStatus null = no answer (network/timeout)
 * @param {{ latestMigration: string | null, now: Date }} ctx
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function judge(answer, ctx) {
  const { httpStatus, body } = answer;
  if (httpStatus === null) return { ok: false, reasons: ["no answer from the installation (down, DNS or timeout)"] };
  if (httpStatus === 401) return { ok: false, reasons: ["401: HEALTH_SECRET differs from the one configured in the installation"] };
  if (httpStatus !== 200 && httpStatus !== 503) return { ok: false, reasons: [`unexpected HTTP ${httpStatus}`] };

  const b = body && typeof body === "object" ? body : {};
  const reasons = [];
  const problems = Array.isArray(b.problems) ? b.problems : [];
  for (const p of problems) reasons.push(PROBLEM_TEXT[p] ?? "unknown problem reported");
  if (httpStatus === 503 && reasons.length === 0) reasons.push("degraded without a recognised problem");
  if (b.status !== "ok" && b.status !== "degraded") reasons.push("response is not a health report");

  // The body comes from a remote host: only a plain 14-digit version is ever echoed into the log.
  const last = typeof b.lastMigration === "string" && /^\d{14}$/.test(b.lastMigration) ? b.lastMigration : null;
  if (ctx.latestMigration && b.status && (!last || last < ctx.latestMigration.slice(0, 14))) {
    const due = migrationDate(ctx.latestMigration);
    if (due && ctx.now.getTime() - due.getTime() > MIGRATION_GRACE_MS) {
      reasons.push(`database is behind the repository (applied ${last ?? "none"}, latest ${ctx.latestMigration.slice(0, 14)})`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}
