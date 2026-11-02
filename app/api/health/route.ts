import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isBearerAuthorized } from "@/lib/cron-auth";
import { getHealthSnapshot } from "@/lib/dal/health";
import { evaluateHealth } from "@/lib/domain/health";
import { errorName, log, newRequestId } from "@/lib/log";

// Installation health (SD-1004, ADR 0010). Read by the owner's scheduled monitor, never by users.
// Authenticated with HEALTH_SECRET only: no secret configured, or a wrong one, answers the same bare 401
// and reveals nothing (not even that the route exists). 200 = healthy, 503 = degraded (problem codes in the
// body), 500 = the check itself failed. The body is a closed set of fields: no ids, names, URLs or keys.
const ROUTE = "/api/health";

export async function GET(request: Request) {
  const requestId = newRequestId();
  const headers = { "Cache-Control": "no-store", "x-request-id": requestId };
  if (!isBearerAuthorized(request.headers.get("authorization"), env.HEALTH_SECRET)) {
    log("warn", "health.unauthorized", { requestId, route: ROUTE, method: request.method, status: 401 });
    return new NextResponse(null, { status: 401, headers });
  }
  try {
    const report = evaluateHealth(await getHealthSnapshot(), process.env.VERCEL_GIT_COMMIT_SHA);
    const status = report.status === "ok" ? 200 : 503;
    log(report.status === "ok" ? "info" : "warn", "health.checked", { requestId, route: ROUTE, status, outcome: report.status });
    return NextResponse.json(report, { status, headers });
  } catch (error) {
    log("error", "health.failed", { requestId, route: ROUTE, status: 500, errorName: errorName(error) });
    return NextResponse.json({ error: "internal" }, { status: 500, headers });
  }
}
