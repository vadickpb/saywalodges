import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

// Request-rate limiting for the public guest actions (SD-409). Counters live in the database (check_public_rate_limit) so the limit
// holds across serverless instances without an external service. The key is an HMAC of the caller, so no IP or email is stored.
export type RateScope = "quote" | "checkout" | "voucher";

// Per caller IP. Generous for a shared Wi-Fi, tight enough to stop a script.
export const RATE_LIMITS: Record<RateScope, { limit: number; windowSeconds: number }> = {
  quote: { limit: 30, windowSeconds: 600 },
  checkout: { limit: 10, windowSeconds: 3600 },
  voucher: { limit: 10, windowSeconds: 3600 },
};
// Per guest e-mail on top of the IP limit, so rotating IPs does not help to hold many dates for one contact.
export const CHECKOUT_PER_EMAIL = { limit: 5, windowSeconds: 3600 };

// Vercel overwrites these headers with the real client address; on other hosts the proxy must do the same (docs/cron.md).
export function clientIpFrom(h: Pick<Headers, "get">): string {
  const raw = h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for") ?? "";
  const ip = raw.split(",")[0]?.trim() ?? "";
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : "unknown";
}

export function rateKey(secret: string, scope: string, value: string): string {
  return createHmac("sha256", secret).update(`${scope}|${value.toLowerCase()}`).digest("hex");
}

async function consume(scope: RateScope, value: string, limit: number, windowSeconds: number): Promise<boolean> {
  const secret = env.CRON_SECRET;
  // No secret configured (local dev): do not block, but say so once per call in the logs.
  if (!secret) return true;
  const { data, error } = await getSupabaseAnon().rpc("check_public_rate_limit", {
    p_scope: scope, p_key_hash: rateKey(secret, scope, value), p_limit: limit, p_window_seconds: windowSeconds,
  });
  // Fail open: a counter outage must not take bookings down (the database caps from SD-403/404 still apply).
  if (error || typeof data !== "boolean") { log("warn", "ratelimit.check_failed", { code: error?.code ?? "INVALID_RESPONSE" }); return true; }
  if (!data) log("info", "ratelimit.blocked", { outcome: scope });
  return data;
}

/** True when the request may continue. `email` adds the per-contact budget (checkout only). */
export async function allowPublicRequest(scope: RateScope, email?: string): Promise<boolean> {
  const ip = clientIpFrom(await headers());
  const { limit, windowSeconds } = RATE_LIMITS[scope];
  if (!(await consume(scope, ip, limit, windowSeconds))) return false;
  if (scope === "checkout" && email) return consume(scope, `email:${email}`, CHECKOUT_PER_EMAIL.limit, CHECKOUT_PER_EMAIL.windowSeconds);
  return true;
}
