import "server-only";
import { z } from "zod";
import { log } from "@/lib/log";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { createClient } from "@/lib/supabase/server";
import { mergeWhatsappRules, whatsappRuleSchema, type WhatsappRule } from "@/lib/domain/whatsapp-rules";

// Reads and saves the WhatsApp rules of the ACTIVE organization (SD-1010). The organization always comes from the session;
// reads go through RLS (members), writes through set_whatsapp_rule, which the database restricts to owners.

export class NotOwnerError extends Error {}

const rowSchema = z.array(z.object({ kind: z.string(), enabled: z.boolean(), offset_days: z.number(), window_start: z.number(), window_end: z.number() }));

export async function listWhatsappRules(): Promise<WhatsappRule[]> {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) throw new Error("No active organization");
  const { data, error } = await (await createClient()).from("whatsapp_rules").select("kind, enabled, offset_days, window_start, window_end").eq("org_id", activeOrg.id);
  const rows = rowSchema.safeParse(data);
  if (error || !rows.success) {
    log("error", "whatsapp_rules.read_failed", { code: error?.code ?? "INVALID" });
    throw new Error("No se pudieron leer las reglas de WhatsApp.");
  }
  return mergeWhatsappRules(rows.data);
}

export async function saveWhatsappRule(input: unknown): Promise<void> {
  const rule = whatsappRuleSchema.parse(input);
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) throw new Error("No active organization");
  if (activeOrg.role !== "owner") throw new NotOwnerError("Solo el dueño puede cambiar las reglas de WhatsApp.");
  const { error } = await (await createClient()).rpc("set_whatsapp_rule", {
    p_org_id: activeOrg.id, p_kind: rule.kind, p_enabled: rule.enabled, p_offset_days: rule.offsetDays,
    p_window_start: rule.windowStart, p_window_end: rule.windowEnd,
  });
  if (error) {
    log("error", "whatsapp_rules.save_failed", { code: error.code });
    throw error.code === "42501" ? new NotOwnerError("Solo el dueño puede cambiar las reglas de WhatsApp.") : new Error("No se pudo guardar la regla.");
  }
}
