import { z } from "zod";

// Email configuration (SD-306). Deliberately NOT part of lib/env.ts: that
// schema throws at import time, and a missing Resend key must never break
// `next build`, previews or unrelated pages. Everything here is resolved lazily
// from a plain env record and fails *closed* at send time instead.

export type EmailConfig =
  | { mode: "simulate" }
  | {
      mode: "resend";
      apiKey: string;
      from: string;
      replyTo?: string;
      // Non-production deployments only deliver to these addresses (exact
      // address or "@domain"), so a preview can never mail a real guest.
      // `null` = unrestricted (production).
      allowedRecipients: string[] | null;
    }
  | { mode: "disabled"; reason: "missing_api_key" | "invalid_from" | "invalid_reply_to" | "simulate_in_production" };

type EnvSource = Record<string, string | undefined>;

const emailSchema = z.email();
const modeSchema = z.enum(["simulate", "resend"]);

// Blank values (`RESEND_API_KEY=` in a copied .env) count as unset.
function read(source: EnvSource, key: string): string | undefined {
  const value = source[key]?.trim();
  return value ? value : undefined;
}

export function isProductionEnv(source: EnvSource = process.env): boolean {
  const vercelEnv = read(source, "VERCEL_ENV");
  return vercelEnv ? vercelEnv === "production" : read(source, "NODE_ENV") === "production";
}

// "Name <addr@domain>" or a bare address. Control characters (CR/LF) are
// rejected outright: this string ends up in a header-like field.
const FROM_PATTERN = /^(?:([^<>"\r\n]{1,100}?)\s*<([^<>\s]+)>|([^<>\s]+))$/;

export function parseSender(value: string): string | null {
  if (/[\r\n]/.test(value)) return null;
  const match = FROM_PATTERN.exec(value.trim());
  if (!match) return null;
  const address = match[2] ?? match[3];
  if (!emailSchema.safeParse(address).success) return null;
  return match[1] ? `${match[1].trim()} <${address}>` : address;
}

function parseAllowList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function parseEmailConfig(source: EnvSource = process.env): EmailConfig {
  const production = isProductionEnv(source);
  const apiKey = read(source, "RESEND_API_KEY");
  const requested = modeSchema.safeParse(read(source, "EMAIL_MODE"));
  const mode = requested.success ? requested.data : apiKey || production ? "resend" : "simulate";

  if (mode === "simulate") {
    // Simulating in production would silently swallow guest emails.
    return production ? { mode: "disabled", reason: "simulate_in_production" } : { mode: "simulate" };
  }

  if (!apiKey) {
    // Without a key, non-production falls back to simulation (previews and CI
    // keep working); production refuses to pretend.
    return production ? { mode: "disabled", reason: "missing_api_key" } : { mode: "simulate" };
  }

  const from = parseSender(read(source, "EMAIL_FROM") ?? "");
  if (!from) return { mode: "disabled", reason: "invalid_from" };

  const replyToRaw = read(source, "EMAIL_REPLY_TO");
  const replyTo = replyToRaw ? parseSender(replyToRaw) : undefined;
  if (replyToRaw && !replyTo) return { mode: "disabled", reason: "invalid_reply_to" };

  return {
    mode: "resend",
    apiKey,
    from,
    ...(replyTo ? { replyTo } : {}),
    allowedRecipients: production ? null : parseAllowList(read(source, "EMAIL_ALLOWED_RECIPIENTS")),
  };
}

// Who the emails speak as (SD-1005). One brand per deployment: in an installation (ADR 0010) it is the lodging's
// name, set by the install script; it defaults to the product name, so nothing changes until it is configured.
export type EmailBrand = { name: string; poweredBy: boolean };
export const DEFAULT_BRAND_NAME = "Saywa Direct";
export const DEFAULT_BRAND: EmailBrand = { name: DEFAULT_BRAND_NAME, poweredBy: false };
const BRAND_CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

export function parseEmailBrand(source: EnvSource = process.env): EmailBrand {
  // Control characters (CR/LF) would otherwise reach the subject header.
  // Cut by code points (not UTF-16 units, which could split an emoji), then trim what the cut may leave at the end.
  const name =
    Array.from((read(source, "EMAIL_BRAND_NAME") ?? "").replace(BRAND_CONTROL_CHARS, " ").trim()).slice(0, 80).join("").trim() ||
    DEFAULT_BRAND_NAME;
  // "Powered by" only makes sense when the brand is not already the product itself (compared loosely).
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  const flag = read(source, "EMAIL_POWERED_BY")?.toLowerCase();
  return { name, poweredBy: normalize(name) !== normalize(DEFAULT_BRAND_NAME) && (flag === "true" || flag === "1") };
}

export function isRecipientAllowed(config: Extract<EmailConfig, { mode: "resend" }>, to: string): boolean {
  if (config.allowedRecipients === null) return true;
  const address = to.toLowerCase();
  const domain = address.slice(address.lastIndexOf("@"));
  return config.allowedRecipients.some((entry) => entry === address || entry === domain);
}

// Secret for POST /api/email/test. Only honoured outside production; 16+
// chars so a placeholder like "test" is not accepted.
export function getEmailTestSecret(source: EnvSource = process.env): string | null {
  if (isProductionEnv(source)) return null;
  const secret = read(source, "EMAIL_TEST_SECRET");
  return secret && secret.length >= 16 ? secret : null;
}
