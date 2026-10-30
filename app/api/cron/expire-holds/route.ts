import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isCronAuthorized } from "@/lib/cron-auth";
import { expireHolds } from "@/lib/dal/booking-holds";
import { errorName, log, newRequestId } from "@/lib/log";

// Hold expiration job (SD-408). Runs the existing expire_holds RPC as service_role.
// Authenticated with CRON_SECRET only: no secret configured, or a wrong one, answers the
// same bare 401 and runs nothing. Failures answer a generic 500 (details go to the server
// log). The sweep is idempotent, so GET (Vercel Cron) and POST (external schedulers) are both
// accepted and a retry is harmless.
//
// Observability (SD-606): every call logs one structured line (lib/log) with a fresh request id,
// also returned as `x-request-id`. Alert on `cron.expire_holds.failed` (500) in Vercel Logs, or
// on the scheduler's own failed run (see docs/observability.md).
const ROUTE = "/api/cron/expire-holds";

async function handle(request: Request) {
  const requestId = newRequestId();
  const headers = { "Cache-Control": "no-store", "x-request-id": requestId };
  const startedAt = Date.now();
  if (!isCronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    log("warn", "cron.expire_holds.unauthorized", { requestId, route: ROUTE, method: request.method, status: 401 });
    return new NextResponse(null, { status: 401, headers });
  }
  try {
    const expired = await expireHolds();
    log("info", "cron.expire_holds.completed", { requestId, route: ROUTE, status: 200, count: expired, durationMs: Date.now() - startedAt });
    return NextResponse.json({ expired }, { headers });
  } catch (error) {
    log("error", "cron.expire_holds.failed", { requestId, route: ROUTE, status: 500, errorName: errorName(error), durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: "internal" }, { status: 500, headers });
  }
}

export const GET = handle;
export const POST = handle;
