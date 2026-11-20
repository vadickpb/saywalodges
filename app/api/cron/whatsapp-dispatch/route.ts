import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isCronAuthorized } from "@/lib/cron-auth";
import { deliverWhatsappMessages } from "@/lib/dal/whatsapp-dispatch";
import { errorName, log, newRequestId } from "@/lib/log";

const ROUTE = "/api/cron/whatsapp-dispatch";

async function handle(request: Request) {
  const requestId = newRequestId();
  const headers = { "Cache-Control": "no-store", "x-request-id": requestId };
  const startedAt = Date.now();
  if (!isCronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    log("warn", "cron.whatsapp_dispatch.unauthorized", { requestId, route: ROUTE, method: request.method, status: 401 });
    return new NextResponse(null, { status: 401, headers });
  }
  try {
    const summary = await deliverWhatsappMessages();
    log("info", "cron.whatsapp_dispatch.completed", { requestId, route: ROUTE, status: 200, count: summary.sent + summary.simulated, durationMs: Date.now() - startedAt });
    return NextResponse.json({ summary }, { headers });
  } catch (error) {
    log("error", "cron.whatsapp_dispatch.failed", { requestId, route: ROUTE, status: 500, errorName: errorName(error), durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: "internal" }, { status: 500, headers });
  }
}

export const maxDuration = 60;
export const GET = handle;
export const POST = handle;
