import "server-only";
import { claimAlert, listDueFeedIds, settleAlert, syncDueFeed, type AlertClaim, type AlertKind, type FeedOutcome } from "@/lib/dal/ical-cron";
import { sendEmail, type EmailResult } from "@/lib/email/send";
import { log } from "@/lib/log";

// Scheduled sync orchestration (SD-307): bounded batch, per-feed isolation, owner alerts.
export type Summary = {
  due: number;
  synced: number;
  failed: number;
  skipped: number;
  deferred: number;
  alertsSent: number;
  alertsSimulated: number;
  alertsFailed: number;
};

export type Deps = {
  listDueFeedIds: (limit: number) => Promise<string[]>;
  syncDueFeed: (feedId: string) => Promise<FeedOutcome>;
  claimAlert: (feedId: string, kind: AlertKind) => Promise<AlertClaim | null>;
  settleAlert: (feedId: string, claimId: string, delivered: boolean) => Promise<void>;
  sendEmail: (input: Parameters<typeof sendEmail>[0]) => Promise<EmailResult>;
  now: () => number;
};
export const defaultDeps: Deps = { listDueFeedIds, syncDueFeed, claimAlert, settleAlert, sendEmail, now: Date.now };

export type Options = {
  limit: number; // max feeds per execution
  concurrency: number; // feeds fetched in parallel (each fetch is already time- and size-bounded)
  budgetMs: number; // no new chunk starts after this; the rest waits for the next run
  dashboardUrl?: string; // https only; omitted from the email otherwise
};

const ALERT_KINDS: AlertKind[] = ["conflict", "feed_down"];

async function alertOwners(feedId: string, kind: AlertKind, options: Options, deps: Deps, summary: Summary) {
  const claim = await deps.claimAlert(feedId, kind);
  if (!claim) return;
  // Claimed rows are ours alone: concurrent runs get null. Anything but a real delivery releases the claim
  // so the alert is retried later (failure) or when email gets configured (simulation) - never lost.
  let delivered = false;
  let simulated = false;
  try {
    const props = { channel: claim.channel, unitName: claim.unit_name ?? undefined, ...(options.dashboardUrl ? { url: options.dashboardUrl } : {}) };
    for (const [index, to] of claim.recipients.entries()) {
      const idempotencyKey = `ical:${claim.claim_id}:${index}`;
      const result =
        kind === "conflict"
          ? await deps.sendEmail({ template: "icalConflict", lang: "es", to, idempotencyKey, props: { ...props, count: claim.count } })
          : await deps.sendEmail({ template: "icalFeedDown", lang: "es", to, idempotencyKey, props });
      if (result.ok && result.simulated) simulated = true;
      else if (result.ok) delivered = true;
    }
  } catch {
    // sendEmail never throws; this guards the settle step below from an unexpected bug.
  }
  // One real delivery is enough to retire the claim: re-sending would duplicate it to the recipients that got it.
  await settleWithRetry(deps, feedId, claim.claim_id, delivered);
  if (delivered) summary.alertsSent++;
  else if (simulated) summary.alertsSimulated++;
  else summary.alertsFailed++;
}

async function settleWithRetry(deps: Deps, feedId: string, claimId: string, delivered: boolean) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await deps.settleAlert(feedId, claimId, delivered);
      return;
    } catch {
      // retry once; an unsettled claim simply expires in the database
    }
  }
}

export async function runScheduledIcalSync(options: Options, deps: Deps = defaultDeps): Promise<Summary> {
  const startedAt = deps.now();
  const summary: Summary = { due: 0, synced: 0, failed: 0, skipped: 0, deferred: 0, alertsSent: 0, alertsSimulated: 0, alertsFailed: 0 };
  const ids = await deps.listDueFeedIds(options.limit);
  summary.due = ids.length;

  for (let i = 0; i < ids.length; i += options.concurrency) {
    if (deps.now() - startedAt >= options.budgetMs) {
      summary.deferred = ids.length - i;
      break;
    }
    const chunk = ids.slice(i, i + options.concurrency);
    await Promise.all(
      chunk.map(async (feedId) => {
        // Each feed is its own failure domain: nothing below can reject into the batch.
        let outcome: FeedOutcome = "failed";
        try {
          outcome = await deps.syncDueFeed(feedId);
        } catch {
          log("error", "cron.ical_sync.feed_failed");
        }
        summary[outcome]++;
        if (outcome === "skipped") return;
        for (const kind of ALERT_KINDS) {
          try {
            await alertOwners(feedId, kind, options, deps, summary);
          } catch {
            summary.alertsFailed++;
            log("error", "cron.ical_sync.alert_failed");
          }
        }
      }),
    );
  }
  return summary;
}
