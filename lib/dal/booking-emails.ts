import "server-only";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { bookingEvents } from "@/lib/email/content";
import { parseEmailConfig } from "@/lib/email/config";
import { sendEmail } from "@/lib/email/send";
import { ownerBookingParams, ownerVoucherParams } from "@/lib/domain/whatsapp-owner-alerts";
import { ownerWhatsappPhone, sendOwnerWhatsappAlert } from "@/lib/whatsapp/owner-alert";

const claimSchema = z.object({
  id: z.uuid(), attempt: z.number().int().min(1).max(3), event: z.enum(bookingEvents), lang: z.enum(["es", "en"]),
  recipients: z.array(z.email().max(254)), unit: z.string(), check_in: z.iso.date(), check_out: z.iso.date(),
});
const configSchema = z.object({
  EMAIL_ARRIVAL_DAYS: z.preprocess(v => v === "" ? undefined : v, z.coerce.number().int().min(0).max(30).default(3)),
});

// Only called by the authenticated cron. Claims commit BEFORE contacting the provider.
// The database bounds transient retries and abandoned claims to three attempts.
export async function deliverBookingEmails(
  client = getSupabaseAdmin(), send = sendEmail, source: Record<string, string | undefined> = process.env, ownerAlert = sendOwnerWhatsappAlert,
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
      const identity = z.object({ id: z.uuid() }).safeParse(claim.data);
      if (identity.success) {
        const settled = await client.rpc("cron_settle_booking_email", { p_id: identity.data.id, p_outcome: "failed" });
        if (settled.error) throw new Error("Email settle failed");
      }
      summary.failed++;
      continue;
    }
    const event = parsed.data;
    // SD-1011: the owner also gets a WhatsApp for new bookings and vouchers. It is ADDITIONAL: the email below is always sent (Meta
    // accepting a message is not delivery). Only on the first attempt, so a retried email never messages the owner twice.
    if ((event.event === "owner_booking" || event.event === "owner_voucher") && event.attempt === 1 && ownerWhatsappPhone(source)) {
      const context = await client.from("booking_email_events").select("org_id, booking_id").eq("id", event.id).maybeSingle();
      const ids = z.object({ org_id: z.uuid(), booking_id: z.uuid() }).safeParse(context.data);
      if (ids.success) {
        await ownerAlert({
          kind: event.event === "owner_booking" ? "owner_new_booking" : "owner_voucher_uploaded", orgId: ids.data.org_id, bookingId: ids.data.booking_id,
          params: event.event === "owner_booking" ? ownerBookingParams(event.unit, event.check_in, event.check_out) : ownerVoucherParams(event.unit, event.check_in),
        }, source);
      }
    }
    let instructions: string | undefined;
    if (event.event === "arrival") {
      const parsedInstructions = z.string().trim().min(1).max(4000).safeParse(source[
        event.lang === "es" ? "EMAIL_ARRIVAL_INSTRUCTIONS_ES" : "EMAIL_ARRIVAL_INSTRUCTIONS_EN"
      ]);
      if (!parsedInstructions.success) {
        const settled = await client.rpc("cron_settle_booking_email", {
          p_id: event.id, p_attempt: event.attempt, p_outcome: "failed",
        });
        if (settled.error) throw new Error("Email settle failed");
        log("error", "cron.booking_emails.arrival_not_configured");
        summary.failed++;
        continue;
      }
      instructions = parsedInstructions.data;
    }
    let failed = event.recipients.length === 0;
    let retryable = false;
    let simulated = false;
    await Promise.all(event.recipients.map(async (to, index) => {
      try {
        const result = await send({
          template: "booking", lang: event.lang, to,
          idempotencyKey: `booking-email:${event.id}:${index}`,
          props: {
            event: event.event, unit: event.unit, checkIn: event.check_in, checkOut: event.check_out,
            ...(instructions ? { instructions } : {}),
          },
        }, { log: (level, name, fields) => log(level, name, { outcome: fields.reason }) });
        if (!result.ok) { failed = true; retryable ||= result.reason === "unavailable"; }
        else simulated ||= result.simulated;
      } catch {
        failed = true;
        retryable = true;
      }
    }));
    const outcome = failed ? (retryable ? "retry" : "failed") : simulated ? "simulated" : "sent";
    const settled = await client.rpc("cron_settle_booking_email", { p_id: event.id, p_attempt: event.attempt, p_outcome: outcome });
    if (settled.error) {
      log("error", "cron.booking_emails.settle_failed", { code: settled.error.code });
      throw new Error("Email settle failed");
    }
    summary[failed ? "failed" : "sent"]++;
    log(failed ? "error" : "info", "cron.booking_emails.delivery", { outcome });
  }
  return summary;
}
