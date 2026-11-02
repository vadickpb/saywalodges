import "server-only";
import { z } from "zod";
import { log } from "@/lib/log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { RecordedMessage } from "@/lib/whatsapp/send";
import type { StatusEvent } from "@/lib/whatsapp/webhook";

// WhatsApp message ledger (SD-1008). Service-role on purpose: both RPCs are granted to service_role only and are called
// from the server (send path) and from the signed webhook, never from a page or a user action. The ledger stores no
// phone number (see the migration).

export async function logWhatsappMessage(message: RecordedMessage): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("log_whatsapp_message", {
    p_org_id: message.orgId,
    p_booking_id: message.bookingId ?? undefined,
    p_template: message.template,
    p_language: message.language,
    p_wamid: message.wamid,
    p_mode: message.mode,
  });
  if (error) {
    log("error", "whatsapp.log_rpc_failed", { code: error.code });
    throw new Error("log_whatsapp_message failed");
  }
}

const outcomeSchema = z.enum(["updated", "ignored", "unknown"]);

export async function recordWhatsappStatus(event: StatusEvent): Promise<z.infer<typeof outcomeSchema>> {
  const { data, error } = await getSupabaseAdmin().rpc("record_whatsapp_status", {
    p_wamid: event.wamid,
    p_status: event.status,
    p_at: event.at?.toISOString(),
    p_error_code: event.errorCode ?? undefined,
  });
  if (error) {
    log("error", "whatsapp.status_rpc_failed", { code: error.code });
    throw new Error("record_whatsapp_status failed");
  }
  const parsed = outcomeSchema.safeParse(data);
  if (!parsed.success) {
    log("error", "whatsapp.status_bad_result");
    throw new Error("record_whatsapp_status failed");
  }
  return parsed.data;
}
