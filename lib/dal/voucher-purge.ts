import "server-only";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { VOUCHER_BUCKET } from "@/lib/domain/payment-voucher";
import { purgeVoucherSchema, selectVoucherPurge, VOUCHER_PURGE_LIMIT } from "@/lib/domain/voucher-purge";

// Cron-only service-role access. Claims survive failures so the next run retries safely.
export async function purgeVouchers() {
  const admin = getSupabaseAdmin();
  const inventory = await admin.rpc("cron_list_voucher_purge");
  if (inventory.error) throw new Error("Voucher inventory failed");
  const objects = z.array(purgeVoucherSchema).max(VOUCHER_PURGE_LIMIT).parse(inventory.data);
  const selected = selectVoucherPurge(objects, Date.now());
  const paths: string[] = [];
  for (const object of selected) {
    const claim = await admin.rpc("cron_claim_voucher_purge", { p_id: object.id, p_snapshot: object });
    if (claim.error) throw new Error("Voucher claim failed");
    if (z.boolean().parse(claim.data)) paths.push(object.path);
  }
  if (paths.length) {
    const removed = await admin.storage.from(VOUCHER_BUCKET).remove(paths);
    if (removed.error) throw new Error("Voucher removal failed");
    // Storage may have removed the objects in another overlapping execution; that is success too.
  }
  return { selected: selected.length, deleted: paths.length };
}
