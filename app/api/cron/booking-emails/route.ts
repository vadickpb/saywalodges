import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isCronAuthorized } from "@/lib/cron-auth";
import { deliverBookingEmails } from "@/lib/dal/booking-emails";
import { errorName, log, newRequestId } from "@/lib/log";

const ROUTE = "/api/cron/booking-emails";

async function handle(request: Request) {
  const requestId = newRequestId();
  const headers = { "Cache-Control": "no-store", "x-request-id": requestId };
  const startedAt = Date.now();
  if (!isCronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    log("warn", "cron.booking_emails.unauthorized", { requestId, route: ROUTE, method: request.method, status: 401 });
    return new NextResponse(null, { status: 401, headers });
  }
  try {
    const summary = await deliverBookingEmails();
    log("info", "cron.booking_emails.completed", { requestId, route: ROUTE, status: 200, count: summary.sent, durationMs: Date.now() - startedAt });
    return NextResponse.json({ summary }, { headers });
  } catch (error) {
    log("error", "cron.booking_emails.failed", { requestId, route: ROUTE, status: 500, errorName: errorName(error), durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: "internal" }, { status: 500, headers });
  }
}

export const maxDuration = 60;
export const GET = handle;
export const POST = handle;
