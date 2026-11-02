// WhatsApp Business Cloud API configuration (SD-1008, ADR 0010). Same shape as lib/email/config.ts, and for the
// same reason NOT part of lib/env.ts: a missing credential must never break `next build`, previews or unrelated
// pages; it fails *closed* at send time. One WhatsApp number per installation; the Meta business verification,
// the number and the template approval are the owner's per-client steps (docs/whatsapp.md).

export type WhatsappConfig =
  | { mode: "simulate" }
  | { mode: "live"; accessToken: string; phoneNumberId: string; apiVersion: string }
  | { mode: "disabled"; reason: "missing_credentials" | "invalid_phone_number_id" | "invalid_api_version" | "simulate_in_production" };

export type WebhookConfig = { appSecret: string; verifyToken: string };

type EnvSource = Record<string, string | undefined>;

function read(source: EnvSource, key: string): string | undefined {
  const value = source[key]?.trim();
  return value ? value : undefined;
}

function isProduction(source: EnvSource): boolean {
  const vercelEnv = read(source, "VERCEL_ENV");
  return vercelEnv ? vercelEnv === "production" : read(source, "NODE_ENV") === "production";
}

// Meta's Graph API version is a deployment setting, not a constant: versions are retired over time. Verify the
// default in docs/whatsapp.md before the first live send.
export const DEFAULT_API_VERSION = "v21.0";

export function parseWhatsappConfig(source: EnvSource = process.env): WhatsappConfig {
  const production = isProduction(source);
  const token = read(source, "WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = read(source, "WHATSAPP_PHONE_NUMBER_ID");
  const requested = read(source, "WHATSAPP_MODE");
  const mode = requested === "simulate" || requested === "live" ? requested : token || production ? "live" : "simulate";

  if (mode === "simulate") {
    // Simulating in production would silently swallow guest messages.
    return production ? { mode: "disabled", reason: "simulate_in_production" } : { mode: "simulate" };
  }
  if (!token || !phoneNumberId) {
    // Non-production falls back to simulation so previews and CI keep working; production refuses to pretend.
    return production ? { mode: "disabled", reason: "missing_credentials" } : { mode: "simulate" };
  }
  if (!/^[0-9]{5,30}$/.test(phoneNumberId)) return { mode: "disabled", reason: "invalid_phone_number_id" };
  const apiVersion = read(source, "WHATSAPP_API_VERSION") ?? DEFAULT_API_VERSION;
  if (!/^v[0-9]{1,2}\.[0-9]$/.test(apiVersion)) return { mode: "disabled", reason: "invalid_api_version" };
  return { mode: "live", accessToken: token, phoneNumberId, apiVersion };
}

// The webhook needs the app secret (signature of every POST) and the verify token (the one-off GET handshake). Both must
// be long enough that a placeholder like "test" is not accepted; without them the route refuses everything.
export function parseWebhookConfig(source: EnvSource = process.env): WebhookConfig | null {
  const appSecret = read(source, "WHATSAPP_APP_SECRET");
  const verifyToken = read(source, "WHATSAPP_VERIFY_TOKEN");
  if (!appSecret || appSecret.length < 16 || !verifyToken || verifyToken.length < 16) return null;
  return { appSecret, verifyToken };
}
