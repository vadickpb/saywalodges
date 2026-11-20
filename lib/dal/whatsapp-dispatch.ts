import "server-only";
import { z } from "zod";
import { log } from "@/lib/log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildWhatsappMessage, normalizeWhatsappPhone, whatsappClaimSchema } from "@/lib/domain/whatsapp-templates";
import { parseWhatsappConfig } from "@/lib/whatsapp/config";
import { sendWhatsappTemplate } from "@/lib/whatsapp/send";

// Scheduled WhatsApp delivery (SD-1009). Called ONLY by the authenticated cron route (service role): never from a page or a
// user action. The database decides what is due and for whom (bookings with an active opt-in, re-checked at claim time);
// this function only turns one claim into one template message. At-most-once: a claim is committed before contacting Meta
// and is never retried (the Cloud API has no idempotency key, a duplicate WhatsApp is worse than a missed reminder).

const settingsSchema = z.object({
  WHATSAPP_ARRIVAL_DAYS: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(0).max(14).default(1)),
  WHATSAPP_RETENTION_DAYS: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(30).max(3650).default(365)),
});

export type WhatsappDispatchSummary = { status: "ok" | "not_configured"; sent: number; simulated: number; failed: number; skipped: number };

type Source = Record<string, string | undefined>;

export async function deliverWhatsappMessages(
  client = getSupabaseAdmin(), send = sendWhatsappTemplate, source: Source = process.env,
): Promise<WhatsappDispatchSummary> {
  const summary: WhatsappDispatchSummary = { status: "ok", sent: 0, simulated: 0, failed: 0, skipped: 0 };
  const settings = settingsSchema.safeParse(source);
  if (!settings.success) {
    log("error", "cron.whatsapp.invalid_settings");
    throw new Error("WhatsApp settings invalid");
  }
  // Production without credentials (the Meta paperwork takes weeks): nothing is queued or claimed and nothing pretends to be sent.
  if (parseWhatsappConfig(source).mode === "disabled") {
    log("warn", "cron.whatsapp.not_configured");
    return { ...summary, status: "not_configured" };
  }

  const deadline = Date.now() + 40_000;
  for (let i = 0; i < 40 && Date.now() < deadline; i++) {
    const claimed = await client.rpc("cron_claim_whatsapp_message", { p_arrival_days: settings.data.WHATSAPP_ARRIVAL_DAYS });
    if (claimed.error) {
      log("error", "cron.whatsapp.claim_failed", { code: claimed.error.code });
      throw new Error("WhatsApp claim failed");
    }
    if (claimed.data === null) break;
    if (z.object({ skip: z.literal(true) }).safeParse(claimed.data).success) {
      summary.skipped++;
      continue;
    }
    const settle = async (id: string, outcome: "sent" | "simulated" | "failed" | "skipped") => {
      const settled = await client.rpc("cron_settle_whatsapp_message", { p_id: id, p_outcome: outcome });
      if (settled.error) {
        log("error", "cron.whatsapp.settle_failed", { code: settled.error.code });
        throw new Error("WhatsApp settle failed");
      }
    };

    const parsed = whatsappClaimSchema.safeParse(claimed.data);
    if (!parsed.success) {
      // Includes a claim without the literal `opt_in: true`: never sent.
      log("error", "cron.whatsapp.invalid_claim");
      const identity = z.object({ id: z.uuid() }).safeParse(claimed.data);
      if (identity.success) await settle(identity.data.id, "failed");
      summary.failed++;
      continue;
    }
    const claim = parsed.data;
    const to = normalizeWhatsappPhone(claim.phone);
    const message = buildWhatsappMessage(claim);
    if (!to || !message) {
      log("warn", "cron.whatsapp.unsendable", { outcome: claim.kind });
      await settle(claim.id, "skipped");
      summary.skipped++;
      continue;
    }

    let result: Awaited<ReturnType<typeof sendWhatsappTemplate>>;
    try {
      // orgId and bookingId come from the claim (the database), never from a request.
      result = await send({
        orgId: claim.org_id, bookingId: claim.booking_id, to, template: message.template, language: message.language,
        params: message.params, optIn: true,
      });
    } catch {
      result = { ok: false, reason: "unavailable" };
    }
    if (result.ok) {
      await settle(claim.id, result.simulated ? "simulated" : "sent");
      summary[result.simulated ? "simulated" : "sent"]++;
    } else {
      await settle(claim.id, "failed");
      summary.failed++;
      log("error", "cron.whatsapp.send_failed", { outcome: `${claim.kind}.${result.reason}` });
    }
  }
  return summary;
}

export async function purgeWhatsappRecords(client = getSupabaseAdmin(), source: Source = process.env) {
  const settings = settingsSchema.safeParse(source);
  if (!settings.success) {
    log("error", "cron.whatsapp_purge.invalid_settings");
    throw new Error("WhatsApp settings invalid");
  }
  const { data, error } = await client.rpc("cron_purge_whatsapp", { p_days: settings.data.WHATSAPP_RETENTION_DAYS });
  if (error) {
    log("error", "cron.whatsapp_purge.rpc_failed", { code: error.code });
    throw new Error("WhatsApp purge failed");
  }
  const parsed = z.object({ messages: z.number().int(), outbox: z.number().int() }).safeParse(data);
  if (!parsed.success) throw new Error("WhatsApp purge failed");
  return parsed.data;
}
