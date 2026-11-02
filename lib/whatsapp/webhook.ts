import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Pure side of the WhatsApp webhook (SD-1008): signature, handshake and payload parsing. No I/O.

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time string comparison (both sides hashed to a fixed length first). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Verifies `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256(app secret, raw body). The RAW body, not re-serialised JSON.
 */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header);
  if (!match) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  return timingSafeEqual(Buffer.from(match[1], "hex"), expected);
}

/**
 * The one-off GET handshake when the webhook is registered in Meta's dashboard. Returns the challenge to echo, or null.
 * The challenge is only echoed if it is a plain token (Meta sends digits): never reflect arbitrary content.
 */
export function verifyHandshake(params: URLSearchParams, verifyToken: string): string | null {
  const challenge = params.get("hub.challenge");
  if (params.get("hub.mode") !== "subscribe") return null;
  const token = params.get("hub.verify_token");
  if (!token || !safeEqual(token, verifyToken)) return null;
  return challenge && /^[0-9A-Za-z_-]{1,200}$/.test(challenge) ? challenge : null;
}

export const DELIVERY_STATUSES = ["sent", "delivered", "read", "failed"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type StatusEvent = { wamid: string; status: DeliveryStatus; at: Date | null; errorCode: string | null };

const statusSchema = z.object({
  id: z.string().min(1).max(200),
  status: z.string(),
  timestamp: z.string().regex(/^[0-9]{1,12}$/).optional(),
  errors: z.array(z.object({ code: z.union([z.number(), z.string()]).optional() })).optional(),
});
const payloadSchema = z.object({
  entry: z.array(z.object({ changes: z.array(z.object({ value: z.object({ statuses: z.array(statusSchema).optional() }) })).optional() })).optional(),
});

/**
 * Delivery-status events from a signed payload. Anything else (inbound guest messages, template updates, unknown
 * statuses such as "deleted") is deliberately ignored: this installation only tracks the messages it sent.
 * Returns null if the body is not the expected envelope at all.
 */
export function parseStatusEvents(payload: unknown): StatusEvent[] | null {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const events: StatusEvent[] = [];
  for (const entry of parsed.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value.statuses ?? []) {
        if (!(DELIVERY_STATUSES as readonly string[]).includes(s.status)) continue;
        const code = s.errors?.[0]?.code;
        const errorCode = code !== undefined && /^[0-9A-Za-z_.-]{1,40}$/.test(String(code)) ? String(code) : null;
        events.push({
          wamid: s.id,
          status: s.status as DeliveryStatus,
          at: s.timestamp ? new Date(Number(s.timestamp) * 1000) : null,
          errorCode,
        });
      }
    }
  }
  return events;
}
