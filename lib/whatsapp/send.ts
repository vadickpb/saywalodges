import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseWhatsappConfig, type WhatsappConfig } from "./config";

// Sends an approved WhatsApp *template* message through the Cloud API (SD-1008). Free-form text is not supported on
// purpose: outside the 24 h window Meta only delivers approved templates, and the booking flows (SD-1009) use those.
//
// CONSENT: this function does NOT decide whether a guest may be messaged. The caller must hold the guest's WhatsApp opt-in
// (SD-1009) and pass `optIn: true`; the literal type makes forgetting it a compile error, not a runtime surprise.
//
// No automatic retry: the API has no idempotency key, so retrying a request whose outcome is unknown (timeout) could
// message the guest twice. The result says "unavailable" and the caller decides.

export type WhatsappFailure = "not_configured" | "invalid_input" | "rejected" | "unavailable";
export type WhatsappResult = { ok: true; id: string; simulated: boolean } | { ok: false; reason: WhatsappFailure };

export type SendTemplateInput = {
  orgId: string;
  bookingId?: string | null;
  /** Digits with country code, e.g. 51999999999. Never logged and never stored. */
  to: string;
  /** Name of a template approved by Meta (lowercase, digits, underscores). */
  template: string;
  /** Meta language code: "es", "en", "en_US"… */
  language: string;
  /** Body variables, in order ({{1}}, {{2}}…). */
  params?: string[];
  optIn: true;
};

export type RecordedMessage = { orgId: string; bookingId: string | null; template: string; language: string; wamid: string; mode: "simulate" | "live" };

export type WhatsappDeps = {
  config?: WhatsappConfig;
  fetch?: typeof fetch;
  /** Persists the ledger row. Default: the service-role DAL. A failure here never turns a delivered send into an error. */
  record?: (message: RecordedMessage) => Promise<void>;
  log?: (level: "info" | "warn" | "error", event: string, fields: Record<string, string | number>) => void;
};

const TIMEOUT_MS = 10_000;
const toSchema = z.string().regex(/^[0-9]{8,15}$/);
const templateSchema = z.string().regex(/^[a-z0-9_]{1,512}$/);
const languageSchema = z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/);
// Meta rejects newlines, tabs and runs of 4+ spaces in a body variable, and caps its length.
const paramSchema = z.string().min(1).max(1024).transform((v) => v.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   "));
const providerOk = z.object({ messages: z.array(z.object({ id: z.string().min(1).max(200) })).min(1) });
const providerError = z.object({ error: z.object({ code: z.number().int().optional() }) });

const defaultLog: NonNullable<WhatsappDeps["log"]> = (level, event, fields) => console[level](JSON.stringify({ event, ...fields }));

async function defaultRecord(message: RecordedMessage): Promise<void> {
  const { logWhatsappMessage } = await import("@/lib/dal/whatsapp");
  await logWhatsappMessage(message);
}

export async function sendWhatsappTemplate(input: SendTemplateInput, deps: WhatsappDeps = {}): Promise<WhatsappResult> {
  const log = deps.log ?? defaultLog;
  const config = deps.config ?? parseWhatsappConfig();
  const base = { template: input.template, language: input.language, mode: config.mode };

  if (config.mode === "disabled") {
    log("error", "whatsapp.not_configured", { ...base, reason: config.reason });
    return { ok: false, reason: "not_configured" };
  }

  const to = toSchema.safeParse(input.to);
  const template = templateSchema.safeParse(input.template);
  const language = languageSchema.safeParse(input.language);
  const params = z.array(paramSchema).max(20).safeParse(input.params ?? []);
  if (!to.success || !template.success || !language.success || !params.success || (input.optIn as boolean) !== true) {
    log("warn", "whatsapp.invalid_input", base);
    return { ok: false, reason: "invalid_input" };
  }

  const record = deps.record ?? defaultRecord;
  const persist = async (wamid: string, mode: "simulate" | "live") => {
    try {
      await record({ orgId: input.orgId, bookingId: input.bookingId ?? null, template: template.data, language: language.data, wamid, mode });
    } catch {
      // The message already left (or was simulated): report the failure to ops, do not pretend the send failed.
      log("error", "whatsapp.record_failed", base);
    }
  };

  if (config.mode === "simulate") {
    const id = `sim_${randomUUID()}`;
    log("info", "whatsapp.simulated", { ...base, messageId: id });
    await persist(id, "simulate");
    return { ok: true, id, simulated: true };
  }

  const body = {
    messaging_product: "whatsapp",
    to: to.data,
    type: "template",
    template: {
      name: template.data,
      language: { code: language.data },
      ...(params.data.length > 0 ? { components: [{ type: "body", parameters: params.data.map((text) => ({ type: "text", text })) }] } : {}),
    },
  };

  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
  } catch {
    // Timeout or network error: the outcome is unknown, and there is no idempotency key to retry safely.
    log("error", "whatsapp.unavailable", base);
    return { ok: false, reason: "unavailable" };
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    /* non-JSON body */
  }

  if (response.ok) {
    const ok = providerOk.safeParse(json);
    if (!ok.success) {
      log("error", "whatsapp.bad_response", { ...base, status: response.status });
      return { ok: false, reason: "unavailable" };
    }
    const wamid = ok.data.messages[0].id;
    log("info", "whatsapp.sent", { ...base, messageId: wamid });
    await persist(wamid, "live");
    return { ok: true, id: wamid, simulated: false };
  }

  const providerCode = providerError.safeParse(json);
  const fields = { ...base, status: response.status, ...(providerCode.success && providerCode.data.error.code ? { providerCode: providerCode.data.error.code } : {}) };
  if (response.status >= 500 || response.status === 429) {
    log("error", "whatsapp.unavailable", fields);
    return { ok: false, reason: "unavailable" };
  }
  log("warn", "whatsapp.rejected", fields);
  return { ok: false, reason: "rejected" };
}
