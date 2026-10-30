import "server-only";
import { z } from "zod";
import { log } from "@/lib/log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Hold sweep (SD-408). Service-role on purpose: expire_holds is granted to service_role only
// and is called from the authenticated cron route, never from a page or a user action.
// Pending bookings whose hold ran out become `expired` and their calendar block is deleted;
// bookings with a voucher under review are kept (decided in SD-401's release_expired_holds).
export async function expireHolds(): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc("expire_holds");
  if (error) {
    log("error", "cron.expire_holds.rpc_failed", { code: error.code });
    throw new Error("expire_holds failed");
  }
  const parsed = z.number().int().nonnegative().safeParse(data);
  if (!parsed.success) {
    log("error", "cron.expire_holds.bad_result");
    throw new Error("expire_holds failed");
  }
  return parsed.data;
}
