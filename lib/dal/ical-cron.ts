import "server-only";
import { z } from "zod";
import { log } from "@/lib/log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ICAL_CHANNELS } from "@/lib/domain/ical-feeds";
import { downloadSnapshot } from "./ical-sync";

// Scheduled iCal sync (SD-307). Service-role on purpose: the cron_* RPCs are granted to service_role
// only and are called from the authenticated cron route, never from a page or a user action. The org
// is always resolved by the database from the feed row, so nothing here can cross tenants. They run
// the same lease + all-or-nothing snapshot logic as the owner RPCs (begin/finish_ical_sync).
type Admin = ReturnType<typeof getSupabaseAdmin>;

const leaseSchema = z.object({ token: z.string().uuid(), url: z.string() });
const uuid = z.string().uuid();
const claimSchema = z.object({
  claim_id: uuid,
  channel: z.enum(ICAL_CHANNELS),
  unit_name: z.string().max(200).nullable(),
  count: z.number().int().min(1),
  recipients: z.array(z.email().max(254)).min(1).max(20),
});
export type AlertClaim = z.infer<typeof claimSchema>;
export type AlertKind = "conflict" | "feed_down";
export type FeedOutcome = "synced" | "failed" | "skipped";

export async function listDueFeedIds(limit: number, client: Admin = getSupabaseAdmin()): Promise<string[]> {
  const { data, error } = await client.rpc("cron_list_due_ical_feeds", { p_limit: limit });
  if (error) {
    log("error", "cron.ical_sync.rpc_failed", { outcome: "list", code: error.code });
    throw new Error("ical list failed");
  }
  const parsed = z.array(z.object({ feed_id: uuid })).safeParse(data);
  if (!parsed.success) throw new Error("ical list failed");
  return parsed.data.map((row) => row.feed_id);
}

// One feed, fully isolated: it resolves to an outcome and never throws, so a bad feed cannot stop the batch.
export async function syncDueFeed(feedId: string, client: Admin = getSupabaseAdmin()): Promise<FeedOutcome> {
  try {
    const started = await client.rpc("cron_begin_ical_sync", { p_feed_id: feedId });
    if (started.error) {
      log("warn", "cron.ical_sync.rpc_failed", { outcome: "begin", code: started.error.code });
      return "failed";
    }
    // null = another run (or the owner) holds the lease: not a failure, nothing to do.
    if (started.data === null) return "skipped";
    const lease = leaseSchema.safeParse(started.data);
    if (!lease.success) return "failed";
    const { events, code } = await downloadSnapshot(lease.data.url);
    const finished = await client.rpc("cron_finish_ical_sync", {
      p_feed_id: feedId,
      p_token: lease.data.token,
      p_events: events,
      ...(code ? { p_error: code } : {}),
    });
    if (finished.error) {
      log("error", "cron.ical_sync.rpc_failed", { outcome: "finish", code: finished.error.code });
      return "failed";
    }
    // false = stale lease (URL changed meanwhile): the newer sync owns the result.
    if (finished.data !== true) return "skipped";
    return code ? "failed" : "synced";
  } catch {
    return "failed";
  }
}

export async function claimAlert(feedId: string, kind: AlertKind, client: Admin = getSupabaseAdmin()): Promise<AlertClaim | null> {
  const { data, error } = await client.rpc("cron_claim_ical_alert", { p_feed_id: feedId, p_kind: kind });
  if (error) {
    log("error", "cron.ical_sync.rpc_failed", { outcome: "claim", code: error.code });
    return null;
  }
  if (data === null) return null;
  const parsed = claimSchema.safeParse(data);
  if (!parsed.success) {
    log("error", "cron.ical_sync.bad_result", { outcome: "claim" });
    return null;
  }
  return parsed.data;
}

export async function settleAlert(feedId: string, claimId: string, delivered: boolean, client: Admin = getSupabaseAdmin()): Promise<void> {
  const { error } = await client.rpc("cron_settle_ical_alert", { p_feed_id: feedId, p_claim_id: claimId, p_delivered: delivered });
  if (error) {
    log("error", "cron.ical_sync.rpc_failed", { outcome: "settle", code: error.code });
    // Let the caller retry: an unsettled claim would expire and the alert would be mailed again.
    throw new Error("settle failed");
  }
}
