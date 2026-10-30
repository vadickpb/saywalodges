import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isCronAuthorized } from "@/lib/cron-auth";
import { platformUrl } from "@/lib/domain/ical-feeds";
import { runScheduledIcalSync } from "@/lib/ical/scheduled-sync";
import { errorName, log, newRequestId } from "@/lib/log";

// Scheduled iCal sync + owner alerts (SD-307). Same auth as the other cron routes (SD-408):
// CRON_SECRET bearer; no secret configured or a wrong one answers a bare 401 and runs nothing.
// One execution syncs at most BATCH_LIMIT due feeds (oldest attempt first), a few at a time, and stops
// starting new work after BUDGET_MS; whatever is left is picked up by the next run. A feed that fails
// is recorded on that feed only. Safe to retry: the lease, the 10-minute re-sync floor and the alert
// ledger in the database make a repeated or overlapping call harmless. GET (Vercel Cron) and POST
// (external schedulers) are both accepted.
//
// Scheduling is NOT configured in the repo (see docs/cron.md): the owner picks a free scheduler.
const ROUTE = "/api/cron/ical-sync";
const BATCH_LIMIT = 25;
const CONCURRENCY = 5;
const BUDGET_MS = 45_000;

export const maxDuration = 60;

async function handle(request: Request) {
  const requestId = newRequestId();
  const headers = { "Cache-Control": "no-store", "x-request-id": requestId };
  const startedAt = Date.now();
  if (!isCronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    log("warn", "cron.ical_sync.unauthorized", { requestId, route: ROUTE, method: request.method, status: 401 });
    return new NextResponse(null, { status: 401, headers });
  }
  try {
    const url = platformUrl(`app.${env.ROOT_DOMAIN}`, "/app/calendar/feeds");
    const summary = await runScheduledIcalSync({
      limit: BATCH_LIMIT,
      concurrency: CONCURRENCY,
      budgetMs: BUDGET_MS,
      ...(url.startsWith("https://") ? { dashboardUrl: url } : {}),
    });
    log("info", "cron.ical_sync.completed", { requestId, route: ROUTE, status: 200, count: summary.due, durationMs: Date.now() - startedAt });
    return NextResponse.json(summary, { headers });
  } catch (error) {
    log("error", "cron.ical_sync.failed", { requestId, route: ROUTE, status: 500, errorName: errorName(error), durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: "internal" }, { status: 500, headers });
  }
}

export const GET = handle;
export const POST = handle;
