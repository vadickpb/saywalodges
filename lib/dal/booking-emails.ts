import "server-only";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { bookingEvents } from "@/lib/email/content";
import { parseEmailConfig } from "@/lib/email/config";
import { sendEmail } from "@/lib/email/send";

const claimSchema = z.object({
  id: z.uuid(), event: z.enum(bookingEvents), lang: z.enum(["es", "en"]),
  recipients: z.array(z.email().max(254)), unit: z.string(), check_in: z.iso.date(), check_out: z.iso.date(),
});
const configSchema = z.object({
  EMAIL_ARRIVAL_DAYS: z.coerce.number().int().min(0).max(30).default(3),
  EMAIL_ARRIVAL_INSTRUCTIONS_ES: z.string().trim().min(1).max(4000),
  EMAIL_ARRIVAL_INSTRUCTIONS_EN: z.string().trim().min(1).max(4000),
});

// Only called by the authenticated cron. Claims commit BEFORE contacting the provider.
// No automatic release: after ambiguous failures, avoiding duplicates takes priority.
export async function deliverBookingEmails(
  client = getSupabaseAdmin(), send = sendEmail, source: Record<string, string | undefined> = process.env,
) {
  const config = configSchema.safeParse(source);
  if (!config.success || parseEmailConfig(source).mode === "disabled") {
    log("error", "cron.booking_emails.not_configured");
    throw new Error("Email configuration unavailable");
  }
  const summary = { sent: 0, failed: 0, skipped: 0 };
  // A single event per claim avoids losing a whole claimed batch on function timeout.
  // Budget leaves time for one provider call (3 x 10s timeout + backoff).
  const deadline = Date.now() + 20_000;
  for (let i = 0; i < 20 && Date.now() < deadline; i++) {
    const claim = await client.rpc("cron_claim_booking_email", { p_arrival_days: config.data.EMAIL_ARRIVAL_DAYS });
    if (claim.error) throw new Error("Email claim failed");
    if (claim.data === null) break;
    if (z.object({ skip: z.literal(true) }).safeParse(claim.data).success) { summary.skipped++; continue; }
    const parsed = claimSchema.safeParse(claim.data);
    if (!parsed.success) {
      log("error", "cron.booking_emails.invalid_claim");
      summary.failed++;
      continue;
    }
    const event = parsed.data;
    let failed = event.recipients.length === 0;
    let simulated = false;
    await Promise.all(event.recipients.map(async (to, index) => {
      try {
        const result = await send({
          template: "booking", lang: event.lang, to,
          idempotencyKey: `booking-email:${event.id}:${index}`,
          props: {
            event: event.event, unit: event.unit, checkIn: event.check_in, checkOut: event.check_out,
            ...(event.event === "arrival" ? { instructions: event.lang === "es"
              ? config.data.EMAIL_ARRIVAL_INSTRUCTIONS_ES : config.data.EMAIL_ARRIVAL_INSTRUCTIONS_EN } : {}),
          },
        }, { log: (level, name, fields) => log(level, name, { outcome: fields.reason }) });
        if (!result.ok) failed = true;
        else simulated ||= result.simulated;
      } catch {
        failed = true;
      }
    }));
    const outcome = failed ? "failed" : simulated ? "simulated" : "sent";
    const settled = await client.rpc("cron_settle_booking_email", { p_id: event.id, p_outcome: outcome });
    if (settled.error) {
      log("error", "cron.booking_emails.settle_failed", { code: settled.error.code });
      throw new Error("Email settle failed");
    }
    summary[failed ? "failed" : "sent"]++;
    log(failed ? "error" : "info", "cron.booking_emails.delivery", { outcome });
  }
  return summary;
}
