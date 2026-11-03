import "server-only";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { log } from "@/lib/log";
import { publicQuoteError, publicQuoteResultSchema, publicQuoteRpcError, type PublicQuoteRequest, type PublicQuoteState } from "@/lib/domain/public-quote";

// Guest self-service quote (SD-404, ADR 0012). The anon role calls create_public_quote, which prices the stay in the database: nothing
// money-related is sent from here. `host` comes from the request, never from the form; the database scopes the unit to it.
export async function createPublicQuote(host: string, input: PublicQuoteRequest): Promise<{ ok: true; token: string } | ({ ok: false } & PublicQuoteState)> {
  if (!host || host.length > 253) return { ok: false, error: "unitNotFound" };
  const { data, error } = await getSupabaseAnon().rpc("create_public_quote", {
    p_host: host, p_unit_id: input.unitId, p_check_in: input.checkIn, p_check_out: input.checkOut, p_guests: input.guests,
  });
  if (error) {
    log("warn", "publicquote.rpc_failed", { code: error.code });
    return { ok: false, ...publicQuoteRpcError(error.code) };
  }
  const parsed = publicQuoteResultSchema.safeParse(data);
  if (!parsed.success) {
    log("error", "publicquote.bad_result");
    return { ok: false, error: "generic" };
  }
  if (parsed.data.ok) return { ok: true, token: parsed.data.token };
  log("info", "publicquote.refused", { outcome: parsed.data.error.toLowerCase().slice(0, 40) });
  return { ok: false, ...publicQuoteError(parsed.data.error, parsed.data) };
}
