import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isCronAuthorized } from "@/lib/cron-auth";
import { expireHolds } from "@/lib/dal/booking-holds";

// Hold expiration job (SD-408). Runs the existing expire_holds RPC as service_role.
// Authenticated with CRON_SECRET only: no secret configured, or a wrong one, answers the
// same bare 401 and runs nothing. Failures answer a generic 500 (details go to the server
// log). The sweep is idempotent, so GET (Vercel Cron) and POST (external schedulers) are both
// accepted and a retry is harmless.
const headers = { "Cache-Control": "no-store" };

async function handle(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return new NextResponse(null, { status: 401, headers });
  }
  try {
    const expired = await expireHolds();
    return NextResponse.json({ expired }, { headers });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500, headers });
  }
}

export const GET = handle;
export const POST = handle;
