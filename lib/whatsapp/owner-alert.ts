import "server-only";
import { normalizeWhatsappPhone } from "@/lib/domain/whatsapp-templates";
import { OWNER_ALERT_TEMPLATES, type OwnerAlertKind } from "@/lib/domain/whatsapp-owner-alerts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsappTemplate, type WhatsappDeps } from "./send";

// Owner alerts over WhatsApp (SD-1011). The recipient is the installation's own number (WHATSAPP_OWNER_PHONE): the owner
// who configures it is the one asking to be messaged, so there is no guest opt-in involved. Email stays the fallback:
// WhatsApp is an ADDITIONAL channel: the email is always sent too, because Meta accepting a message does not mean it was
// delivered (a paused template would silently drop the alert).

type Source = Record<string, string | undefined>;

/** The owner's number as digits with country code, or null when unset or unusable (then only email is used). */
export function ownerWhatsappPhone(source: Source = process.env): string | null {
  const raw = source.WHATSAPP_OWNER_PHONE?.trim();
  return raw ? normalizeWhatsappPhone(raw) : null;
}

export type OwnerAlert = { kind: OwnerAlertKind; orgId: string; bookingId?: string | null; params: string[] };

/**
 * WHATSAPP_OWNER_PHONE belongs to the installation, not to an organization. It is only used when the database holds exactly one
 * organization (one installation per client, ADR 0010); with several, an alert of one could reach another's owner.
 */
async function isSoleOrganization(): Promise<boolean> {
  const { count, error } = await getSupabaseAdmin().from("organizations").select("id", { count: "exact", head: true });
  return !error && count === 1;
}

/** True only when Meta accepted the message. Simulation, missing credentials and every failure return false → email fallback. */
export async function sendOwnerWhatsappAlert(
  alert: OwnerAlert, source: Source = process.env, deps: WhatsappDeps = {}, sole: () => Promise<boolean> = isSoleOrganization,
): Promise<boolean> {
  const to = ownerWhatsappPhone(source);
  if (!to) return false;
  try {
    if (!(await sole())) return false;
    const result = await sendWhatsappTemplate(
      { orgId: alert.orgId, bookingId: alert.bookingId ?? null, to, template: OWNER_ALERT_TEMPLATES[alert.kind].name, language: "es", params: alert.params, optIn: true },
      deps,
    );
    return result.ok && !result.simulated;
  } catch {
    return false;
  }
}
