import { NextResponse } from "next/server";
import { recordWhatsappStatus } from "@/lib/dal/whatsapp";
import { errorName, log, newRequestId } from "@/lib/log";
import { parseWebhookConfig } from "@/lib/whatsapp/config";
import { parseStatusEvents, verifyHandshake, verifySignature } from "@/lib/whatsapp/webhook";

// WhatsApp Cloud API webhook (SD-1008, ADR 0010). Lives on app.<ROOT_DOMAIN> in installation mode (every /api/* does).
//  * GET  — the one-off handshake Meta performs when the webhook is registered (verify token, constant-time).
//  * POST — delivery-status events. EVERY request must carry a valid X-Hub-Signature-256 over the raw body, otherwise a bare
//           401 and nothing is parsed or stored. Events are idempotent (record_whatsapp_status), so Meta's retries are safe:
//           an internal failure answers 500 precisely so that Meta retries.
// Without WHATSAPP_APP_SECRET / WHATSAPP_VERIFY_TOKEN (>= 16 chars) the route refuses everything. Inbound guest messages
// are not processed or stored.
const ROUTE = "/api/whatsapp/webhook";
const MAX_BODY_BYTES = 256 * 1024;

export async function GET(request: Request) {
  const config = parseWebhookConfig();
  const challenge = config ? verifyHandshake(new URL(request.url).searchParams, config.verifyToken) : null;
  if (challenge === null) return new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  const headers = { "Cache-Control": "no-store", "x-request-id": requestId };
  const config = parseWebhookConfig();

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    log("warn", "whatsapp.webhook.too_large", { requestId, route: ROUTE, status: 413 });
    return new NextResponse(null, { status: 413, headers });
  }
  const raw = await request.text();
  if (!config || raw.length > MAX_BODY_BYTES || !verifySignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    log("warn", "whatsapp.webhook.unauthorized", { requestId, route: ROUTE, method: request.method, status: 401 });
    return new NextResponse(null, { status: 401, headers });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    log("warn", "whatsapp.webhook.bad_json", { requestId, route: ROUTE, status: 400 });
    return new NextResponse(null, { status: 400, headers });
  }
  const events = parseStatusEvents(payload);
  if (events === null) {
    log("warn", "whatsapp.webhook.bad_payload", { requestId, route: ROUTE, status: 400 });
    return new NextResponse(null, { status: 400, headers });
  }

  try {
    let updated = 0;
    for (const event of events) {
      if ((await recordWhatsappStatus(event)) === "updated") updated += 1;
    }
    log("info", "whatsapp.webhook.processed", { requestId, route: ROUTE, status: 200, count: events.length, outcome: updated > 0 ? "updated" : "no_change" });
    return new NextResponse(null, { status: 200, headers });
  } catch (error) {
    log("error", "whatsapp.webhook.failed", { requestId, route: ROUTE, status: 500, errorName: errorName(error) });
    return new NextResponse(null, { status: 500, headers });
  }
}
