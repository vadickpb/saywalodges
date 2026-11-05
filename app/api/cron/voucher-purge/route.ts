import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isCronAuthorized } from "@/lib/cron-auth";
import { purgeVouchers } from "@/lib/dal/voucher-purge";
import { errorName, log, newRequestId } from "@/lib/log";

export const maxDuration = 60;

const ROUTE = "/api/cron/voucher-purge";

async function handle(request: Request) {
  const requestId = newRequestId();
  const headers = { "Cache-Control": "no-store", "x-request-id": requestId };
  const startedAt = Date.now();
  if (!isCronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    log("warn", "cron.voucher_purge.unauthorized", { requestId, route: ROUTE, method: request.method, status: 401 });
    return new NextResponse(null, { status: 401, headers });
  }
  try {
    const result = await purgeVouchers();
    log("info", "cron.voucher_purge.completed", { requestId, route: ROUTE, status: 200, count: result.deleted, durationMs: Date.now() - startedAt });
    return NextResponse.json(result, { headers });
  } catch (error) {
    log("error", "cron.voucher_purge.failed", { requestId, route: ROUTE, status: 500, errorName: errorName(error), durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: "internal" }, { status: 500, headers });
  }
}

export const GET = handle;
export const POST = handle;
