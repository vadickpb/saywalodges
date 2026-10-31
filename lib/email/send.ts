import "server-only";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { isRecipientAllowed, parseEmailConfig, type EmailConfig } from "./config";
import type { EmailMessage } from "./content";
import { renderEmail } from "./render";

export type EmailFailure = "not_configured" | "invalid_input" | "recipient_not_allowed" | "rejected" | "unavailable";
export type EmailResult = { ok: true; id: string; simulated: boolean } | { ok: false; reason: EmailFailure };
export type SendEmailInput = EmailMessage & {
  to: string;
  // Reuse the same key for the same logical event (e.g. `booking:<id>:confirmed`)
  // so a retried caller or a webhook replay can't deliver the email twice.
  idempotencyKey?: string;
};

// Log fields are a closed set of non-PII values: never the recipient, subject,
// body, props or the provider's error text. Adding a field here is a privacy
// decision, which is why the type is not `Record<string, unknown>`.
type LogFields = {
  template: string;
  lang: string;
  mode: string;
  attempt?: number;
  status?: number;
  reason?: string;
  providerCode?: string;
  messageId?: string;
};
export type EmailLogger = (level: "info" | "warn" | "error", event: string, fields: LogFields) => void;

export type EmailDeps = {
  config?: EmailConfig;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: EmailLogger;
};

const RESEND_URL = "https://api.resend.com/emails";
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 300;
const TIMEOUT_MS = 10_000;

const defaultLog: EmailLogger = (level, event, fields) => console[level](JSON.stringify({ event, ...fields }));
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const recipientSchema = z.email().max(254);
const providerOk = z.object({ id: z.string().min(1).max(100) });
const providerError = z.object({ name: z.string().regex(/^[a-z_]{1,64}$/) });

export async function sendEmail(input: SendEmailInput, deps: EmailDeps = {}): Promise<EmailResult> {
  const log = deps.log ?? defaultLog;
  const config = deps.config ?? parseEmailConfig();
  const base = { template: input.template, lang: input.lang, mode: config.mode };

  if (config.mode === "disabled") {
    log("error", "email.not_configured", { ...base, reason: config.reason });
    return { ok: false, reason: "not_configured" };
  }

  const to = recipientSchema.safeParse(input.to);
  if (!to.success) {
    log("warn", "email.invalid_input", { ...base, reason: "recipient" });
    return { ok: false, reason: "invalid_input" };
  }

  let rendered;
  try {
    rendered = renderEmail(input);
  } catch {
    log("warn", "email.invalid_input", { ...base, reason: "template" });
    return { ok: false, reason: "invalid_input" };
  }

  if (config.mode === "simulate") {
    const id = `sim_${randomUUID()}`;
    log("info", "email.simulated", { ...base, messageId: id });
    return { ok: true, id, simulated: true };
  }

  if (!isRecipientAllowed(config, to.data)) {
    log("warn", "email.recipient_not_allowed", base);
    return { ok: false, reason: "recipient_not_allowed" };
  }

  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  // One key for every attempt: if a request succeeded but its response was
  // lost, the retry is deduplicated by Resend instead of sending twice.
  const idempotencyKey = (input.idempotencyKey ?? randomUUID()).slice(0, 256);
  const body = JSON.stringify({
    from: config.from,
    to: [to.data],
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(config.replyTo ? { reply_to: config.replyTo } : {}),
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let retryable = false;
    try {
      const response = await doFetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (response.ok) {
        const parsed = providerOk.safeParse(payload);
        // A 2xx means Resend accepted it; never retry (and double-send) over an odd body.
        const id = parsed.success ? parsed.data.id : "unknown";
        log("info", "email.sent", { ...base, attempt, status: response.status, messageId: id });
        return { ok: true, id, simulated: false };
      }

      const code = providerError.safeParse(payload);
      const providerCode = code.success ? code.data.name : undefined;
      retryable =
        response.status === 429 ||
        response.status >= 500 ||
        (response.status === 409 && providerCode === "concurrent_idempotent_requests");
      log(retryable ? "warn" : "error", "email.provider_error", { ...base, attempt, status: response.status, providerCode });
      if (!retryable) return { ok: false, reason: "rejected" };
    } catch {
      // Network failure or timeout: the error text can carry the URL/host, so it is not logged.
      retryable = true;
      log("warn", "email.network_error", { ...base, attempt });
    }
    if (retryable && attempt < MAX_ATTEMPTS) await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
  }

  log("error", "email.gave_up", { ...base, attempt: MAX_ATTEMPTS });
  return { ok: false, reason: "unavailable" };
}
