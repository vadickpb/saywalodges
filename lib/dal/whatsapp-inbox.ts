import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { autoReplyText, isStopMessage, type InboundMessage } from "@/lib/whatsapp/webhook";
import { sendWhatsappText } from "@/lib/whatsapp/send";

// Inbound WhatsApp messages (SD-1012). Called ONLY by the signed webhook (service role). The database stores the message and
// decides, atomically, whether an auto-reply may go out (once per sender per 24 h); this code only sends it.
// No AI: the reply is a fixed text with the quoter link. "STOP" withdraws the guest's consent instead of being answered.

const resultSchema = z.object({ status: z.enum(["stored", "duplicate", "no_org"]), reply: z.boolean(), org_id: z.uuid().optional() });

export type InboundDeps = {
  client?: ReturnType<typeof getSupabaseAdmin>;
  send?: typeof sendWhatsappText;
  source?: Record<string, string | undefined>;
};

export async function handleInboundMessage(message: InboundMessage, deps: InboundDeps = {}): Promise<"stored" | "duplicate" | "no_org"> {
  const client = deps.client ?? getSupabaseAdmin();
  const send = deps.send ?? sendWhatsappText;
  const source = deps.source ?? process.env;
  const stop = message.type === "text" && isStopMessage(message.body);
  const replyText = autoReplyText(env.ROOT_DOMAIN);
  const autoReplyOn = source.WHATSAPP_AUTO_REPLY !== "off";

  const { data, error } = await client.rpc("record_inbound_whatsapp", {
    p_wamid: message.wamid, p_from: message.from, p_name: message.name ?? undefined, p_body: message.body, p_type: message.type,
    p_at: message.at.toISOString(), p_auto_reply: autoReplyOn && !stop && replyText !== null,
  });
  const parsed = resultSchema.safeParse(data);
  if (error || !parsed.success) {
    log("error", "whatsapp.inbound_failed", { code: error?.code ?? "INVALID" });
    throw new Error("record_inbound_whatsapp failed");
  }
  if (parsed.data.status !== "stored") return parsed.data.status;

  if (stop) {
    const revoked = await client.rpc("revoke_whatsapp_optins", { p_from: message.from });
    if (revoked.error) {
      log("error", "whatsapp.revoke_failed", { code: revoked.error.code });
      throw new Error("revoke_whatsapp_optins failed");
    }
    log("info", "whatsapp.optin_revoked", { count: typeof revoked.data === "number" ? revoked.data : 0 });
  }

  if (parsed.data.reply && parsed.data.org_id && replyText) {
    // The reply was claimed in the database before sending: at most once, never retried.
    try {
      const result = await send({ orgId: parsed.data.org_id, to: message.from, body: replyText, inWindow: true });
      if (!result.ok) log("warn", "whatsapp.auto_reply_failed", { outcome: result.reason });
    } catch {
      log("warn", "whatsapp.auto_reply_failed", { outcome: "exception" });
    }
  }
  return "stored";
}
