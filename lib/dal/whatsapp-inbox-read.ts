import "server-only";
import { z } from "zod";
import { log } from "@/lib/log";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { createClient } from "@/lib/supabase/server";

// Reads the WhatsApp inbox of the ACTIVE organization (SD-1012) through RLS (members only) and marks it read.

export type InboxMessage = { id: string; fromPhone: string; name: string | null; type: string; body: string; receivedAt: string; read: boolean; autoReplied: boolean };

const rowSchema = z.array(z.object({
  id: z.string(), from_phone: z.string(), profile_name: z.string().nullable(), msg_type: z.string(), body: z.string(),
  received_at: z.string(), read_at: z.string().nullable(), auto_replied_at: z.string().nullable(),
}));

export async function listInbox(limit = 100): Promise<InboxMessage[]> {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) throw new Error("No active organization");
  const { data, error } = await (await createClient()).from("whatsapp_inbox")
    .select("id, from_phone, profile_name, msg_type, body, received_at, read_at, auto_replied_at")
    .eq("org_id", activeOrg.id).order("received_at", { ascending: false }).limit(limit);
  const rows = rowSchema.safeParse(data);
  if (error || !rows.success) {
    log("error", "whatsapp_inbox.read_failed", { code: error?.code ?? "INVALID" });
    throw new Error("No se pudo leer la bandeja de WhatsApp.");
  }
  return rows.data.map((r) => ({
    id: r.id, fromPhone: r.from_phone, name: r.profile_name, type: r.msg_type, body: r.body, receivedAt: r.received_at,
    read: r.read_at !== null, autoReplied: r.auto_replied_at !== null,
  }));
}

export async function markInboxRead(): Promise<void> {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) throw new Error("No active organization");
  const { error } = await (await createClient()).rpc("mark_whatsapp_inbox_read", { p_org_id: activeOrg.id });
  if (error) {
    log("error", "whatsapp_inbox.mark_failed", { code: error.code });
    throw new Error("No se pudo marcar como leída la bandeja.");
  }
}
