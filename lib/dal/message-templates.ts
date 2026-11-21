import "server-only";
import { z } from "zod";
import { log } from "@/lib/log";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { createClient } from "@/lib/supabase/server";
import {
  CUSTOM_KEYS, EMPTY_HOUSE, effectiveTemplates, houseInfoSchema, isMessageKey, templateInputSchema, type HouseInfo, type Template,
} from "@/lib/domain/message-templates";

// The message library of the ACTIVE organization (SD-1130). Members read it through RLS (they send the messages); only the owner
// writes, through RPCs that re-check it. The organization always comes from the session.

export type MessageLibrary = { templates: Template[]; house: HouseInfo };
export class NotOwnerError extends Error {}

const templateRow = z.object({ key: z.string(), title: z.string(), body_es: z.string(), body_en: z.string(), anchor: z.enum(["check_in", "check_out"]).nullable(), offset_days: z.number().nullable() });
const houseRow = z.object({
  checkin_time: z.string().nullable(), checkout_time: z.string().nullable(), wifi_name: z.string().nullable(), wifi_password: z.string().nullable(),
  door_code: z.string().nullable(), location_url: z.string().nullable(), contact_phone: z.string().nullable(), rules_es: z.string().nullable(), rules_en: z.string().nullable(),
});

/** Built-in messages merged with what the owner customized, plus the house data. A read failure falls back to the built-ins. */
export async function getMessageLibrary(): Promise<MessageLibrary> {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) return { templates: effectiveTemplates([]), house: EMPTY_HOUSE };
  const supabase = await createClient();
  const [templates, house] = await Promise.all([
    supabase.from("message_templates").select("key, title, body_es, body_en, anchor, offset_days").eq("org_id", activeOrg.id),
    supabase.from("message_house_info").select("checkin_time, checkout_time, wifi_name, wifi_password, door_code, location_url, contact_phone, rules_es, rules_en").eq("org_id", activeOrg.id).maybeSingle(),
  ]);
  const rows = z.array(templateRow).safeParse(templates.data);
  const h = house.data === null ? { success: true as const, data: null } : houseRow.safeParse(house.data);
  if (templates.error || house.error || !rows.success || !h.success) {
    // The messages are a convenience: never break the calendar or a booking page.
    log("error", "message_library.read_failed", { code: templates.error?.code ?? house.error?.code ?? "INVALID" });
    return { templates: effectiveTemplates([]), house: EMPTY_HOUSE };
  }
  return {
    templates: effectiveTemplates(rows.data.map((r) => ({ key: r.key, title: r.title, bodyEs: r.body_es, bodyEn: r.body_en, anchor: r.anchor, offsetDays: r.offset_days }))),
    house: h.data
      ? { checkinTime: h.data.checkin_time, checkoutTime: h.data.checkout_time, wifiName: h.data.wifi_name, wifiPassword: h.data.wifi_password, doorCode: h.data.door_code,
          locationUrl: h.data.location_url, contactPhone: h.data.contact_phone, rulesEs: h.data.rules_es, rulesEn: h.data.rules_en }
      : EMPTY_HOUSE,
  };
}

async function ownerContext() {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) throw new Error("No active organization");
  if (activeOrg.role !== "owner") throw new NotOwnerError("Solo el dueño puede cambiar los mensajes.");
  return { orgId: activeOrg.id, supabase: await createClient() };
}

function fail(event: string, error: { code?: string }): never {
  log("error", event, { code: error.code ?? "UNKNOWN" });
  throw error.code === "42501" ? new NotOwnerError("Solo el dueño puede cambiar los mensajes.") : new Error("No se pudo guardar. Inténtalo de nuevo.");
}

export async function saveTemplate(raw: unknown): Promise<void> {
  const t = templateInputSchema.parse(raw);
  const { orgId, supabase } = await ownerContext();
  const { error } = await supabase.rpc("save_message_template", { p_org_id: orgId, p_key: t.key, p_title: t.title, p_body_es: t.bodyEs, p_body_en: t.bodyEn, p_anchor: t.anchor, p_offset: t.offsetDays });
  if (error) fail("message_library.save_failed", error);
}

/** Moments go back to the built-in text; a custom message is removed. */
export async function resetTemplate(key: string): Promise<void> {
  if (!isMessageKey(key)) throw new Error("Mensaje no válido.");
  const { orgId, supabase } = await ownerContext();
  const { error } = await supabase.rpc("delete_message_template", { p_org_id: orgId, p_key: key });
  if (error) fail("message_library.reset_failed", error);
}

export async function saveHouseInfo(raw: unknown): Promise<void> {
  const h = houseInfoSchema.parse(raw);
  const { orgId, supabase } = await ownerContext();
  const { error } = await supabase.rpc("save_message_house_info", {
    p_org_id: orgId, p_checkin: h.checkinTime ?? "", p_checkout: h.checkoutTime ?? "", p_wifi_name: h.wifiName ?? "", p_wifi_password: h.wifiPassword ?? "",
    p_door_code: h.doorCode ?? "", p_location_url: h.locationUrl ?? "", p_contact_phone: h.contactPhone ?? "", p_rules_es: h.rulesEs ?? "", p_rules_en: h.rulesEn ?? "",
  });
  if (error) fail("message_library.house_failed", error);
}

/** The first free custom slot (custom_1..custom_6), or null when the six are in use. */
export function nextCustomKey(templates: Template[]): (typeof CUSTOM_KEYS)[number] | null {
  return CUSTOM_KEYS.find((key) => !templates.some((t) => t.key === key)) ?? null;
}
