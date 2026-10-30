import { NextResponse } from "next/server";
import { getIcalExport } from "@/lib/dal/ical-feeds";
import { buildIcs } from "@/lib/ical/export";
import { errorName, log, newRequestId } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

// Per-channel calendar export (SD-304). Public by design: the secret is the token
// in the URL (244 random bits), which is how Airbnb, Booking and Google Calendar
// subscribe to a calendar. It answers with dates only: every event is "Reservado".
// Unknown, malformed or regenerated tokens all get the same empty 404, so nothing
// tells a wrong token from a revoked one.
const ROUTE = "/api/ical/[token]";
const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const requestId = newRequestId();
  let payload;
  try {
    payload = await getIcalExport(await createClient(), token);
  } catch (error) {
    log("error", "ical.export.failed", { requestId, route: ROUTE, status: 500, errorName: errorName(error) });
    return new NextResponse("No se pudo generar el calendario.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (payload === null) return notFound();

  let ics: string;
  try {
    ics = buildIcs({ name: payload.unit, events: payload.blocks, now: new Date() });
  } catch (error) {
    log("error", "ical.export.failed", { requestId, route: ROUTE, status: 500, errorName: errorName(error) });
    return new NextResponse("No se pudo generar el calendario.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="calendar.ics"',
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
