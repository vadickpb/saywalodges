import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

// Request-rate limiting for the public guest actions (SD-409). Counters live in the database (check_public_rate_limit) so the limit
// holds across serverless instances without an external service. The key is an HMAC of the caller, so no IP or email is stored.
// The RPC is executable by service_role only (anon could flood the table), so this DAL is the one place that calls it with the
// admin client: a deliberate, minimal exception to "service-role only in webhooks/cron/RPCs" (it never reads or writes business data).
export type RateScope = "quote" | "checkout" | "voucher";

// Per caller IP. Generous for a shared Wi-Fi, tight enough to stop a script.
export const RATE_LIMITS: Record<RateScope, { limit: number; windowSeconds: number }> = {
  quote: { limit: 30, windowSeconds: 600 },
  checkout: { limit: 10, windowSeconds: 3600 },
  voucher: { limit: 10, windowSeconds: 3600 },
};
// Per guest e-mail on top of the IP limit, so rotating IPs does not help to hold many dates for one contact.
export const CHECKOUT_PER_EMAIL = { limit: 5, windowSeconds: 3600 };

// Vercel overwrites x-vercel-forwarded-for with the real client address; it is trusted only when running on Vercel. On other hosts the
// proxy must set x-real-ip / x-forwarded-for AND strip any incoming x-vercel-forwarded-for (docs/cron.md).
export function clientIpFrom(h: Pick<Headers, "get">, onVercel = Boolean(process.env.VERCEL)): string {
  const raw = (onVercel ? h.get("x-vercel-forwarded-for") : null) ?? h.get("x-real-ip") ?? h.get("x-forwarded-for") ?? "";
  const ip = raw.split(",")[0]?.trim() ?? "";
  if (!/^[0-9a-fA-F:.]{3,45}$/.test(ip)) return "unknown";
  // A single IPv6 subscriber owns a whole /64: key on the prefix so rotating the host part does not reset the budget.
  if (ip.includes(":") && !ip.includes(".")) {
    const [head = "", tail = ""] = ip.split("::");
    const groups = [...(head ? head.split(":") : []), ...(ip.includes("::") ? Array(Math.max(0, 8 - (head ? head.split(":").length : 0) - (tail ? tail.split(":").length : 0))).fill("0") : []), ...(tail ? tail.split(":") : [])];
    return groups.slice(0, 4).map(g => g.toLowerCase().padStart(4, "0")).join(":") + "::/64";
  }
  return ip;
}

export function rateKey(secret: string, scope: string, value: string): string {
  return createHmac("sha256", secret).update(`${scope}|${value.toLowerCase()}`).digest("hex");
}

async function consume(scope: RateScope, value: string, limit: number, windowSeconds: number): Promise<boolean> {
  const secret = env.CRON_SECRET;
  // No usable secret (local dev): do not block. In production this means rate limiting is OFF, so say it loudly in the logs.
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") log("error", "ratelimit.disabled", { outcome: "no_secret" });
    return true;
  }
  const { data, error } = await getSupabaseAdmin().rpc("check_public_rate_limit", {
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
