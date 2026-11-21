import "server-only";
import { z } from "zod";
import { log } from "@/lib/log";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_STAY, STAY_REQUESTS, stayDetailsSchema, stayKeySchema, stayRequestKeys, type StayDetails, type StayKey } from "@/lib/domain/stay-details";

// Quick stay details (SD-1129) of the ACTIVE organization. Reads go through RLS (members), writes through save_stay_details,
// which re-checks that the stay belongs to the member's organization. The organization always comes from the session.

type Supabase = Awaited<ReturnType<typeof createClient>>;
const rowSchema = z.object({
  booking_id: z.string().nullable(), feed_id: z.string().nullable(), external_uid: z.string().nullable(),
  guest_name: z.string().nullable(), guest_phone: z.string().nullable(), lang: z.enum(["es", "en"]), party_size: z.number().nullable(),
  arrival_time: z.string().nullable(), requests: z.array(z.string()), note: z.string().nullable(), remind_on: z.string().nullable(),
  ref_code: z.string().nullable(), phone_last4: z.string().nullable(),
});
const COLUMNS = "booking_id, feed_id, external_uid, guest_name, guest_phone, lang, party_size, arrival_time, requests, note, remind_on, ref_code, phone_last4";

export const stayMapKey = (key: { bookingId?: string | null; feedId?: string | null; externalUid?: string | null }) =>
  key.bookingId ? `b:${key.bookingId}` : `i:${key.feedId}:${key.externalUid}`;

function toStay(row: z.infer<typeof rowSchema>): StayDetails {
  return {
    name: row.guest_name, phone: row.guest_phone, lang: row.lang, party: row.party_size, arrival: row.arrival_time,
    requests: row.requests.filter((r): r is (typeof stayRequestKeys)[number] => (stayRequestKeys as string[]).includes(r)),
    note: row.note, remindOn: row.remind_on, refCode: row.ref_code, phoneLast4: row.phone_last4,
  };
}

/** Saved details for a set of stays, keyed by `stayMapKey`. Stays with nothing saved are simply absent. */
export async function readStayDetails(supabase: Supabase, orgId: string, input: { bookingIds: string[]; externalUids: string[] }): Promise<Map<string, StayDetails>> {
  const out = new Map<string, StayDetails>();
  const queries = [
    input.bookingIds.length ? supabase.from("stay_details").select(COLUMNS).eq("org_id", orgId).in("booking_id", input.bookingIds) : null,
    input.externalUids.length ? supabase.from("stay_details").select(COLUMNS).eq("org_id", orgId).in("external_uid", input.externalUids) : null,
  ];
  for (const query of queries) {
    if (!query) continue;
    const { data, error } = await query;
    const rows = z.array(rowSchema).safeParse(data);
    if (error || !rows.success) {
      // Details are a convenience: a failure here must never hide the calendar or a booking.
      log("error", "stay_details.read_failed", { code: error?.code ?? "INVALID" });
      continue;
    }
    for (const row of rows.data) out.set(stayMapKey({ bookingId: row.booking_id, feedId: row.feed_id, externalUid: row.external_uid }), toStay(row));
  }
  return out;
}

export async function saveStayDetails(rawKey: unknown, rawDetails: unknown): Promise<void> {
  const key = stayKeySchema.parse(rawKey);
  const d = stayDetailsSchema.parse(rawDetails);
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) throw new Error("No active organization");
  const { error } = await (await createClient()).rpc("save_stay_details", {
    p_org_id: activeOrg.id,
    p_booking_id: key.kind === "booking" ? key.bookingId : null,
    p_feed_id: key.kind === "ical" ? key.feedId : null,
    p_external_uid: key.kind === "ical" ? key.externalUid : null,
    p_name: d.name ?? "", p_phone: d.phone ?? "", p_lang: d.lang, p_party: d.party, p_arrival: d.arrival ?? "",
    p_requests: d.requests, p_note: d.note ?? "", p_remind_on: d.remindOn,
  });
  if (error) {
    log("error", "stay_details.save_failed", { code: error.code });
    throw new Error("No se pudieron guardar los datos de la estadía.");
  }
}

export type UpcomingReminder = { name: string | null; requests: StayDetails["requests"]; note: string | null; remindOn: string; unitId: string | null; start: string | null };

/** Reminders due between `from` and `to` (inclusive, ISO dates), with the unit and the first night of the stay when it can be found. */
export async function listReminders(from: string, to: string): Promise<UpcomingReminder[]> {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("stay_details").select(COLUMNS).eq("org_id", activeOrg.id)
    .gte("remind_on", from).lte("remind_on", to).order("remind_on").limit(50);
  const rows = z.array(rowSchema).safeParse(data);
  if (error || !rows.success) {
    log("error", "stay_details.reminders_failed", { code: error?.code ?? "INVALID" });
    return [];
  }
  const bookingIds = rows.data.map((r) => r.booking_id).filter((v): v is string => !!v);
  const uids = rows.data.map((r) => r.external_uid).filter((v): v is string => !!v);
  const where = new Map<string, { unitId: string; start: string }>();
  const blockQueries = [
    bookingIds.length ? supabase.from("calendar_blocks").select("booking_id, feed_id, external_uid, unit_id, period").eq("org_id", activeOrg.id).in("booking_id", bookingIds) : null,
    uids.length ? supabase.from("calendar_blocks").select("booking_id, feed_id, external_uid, unit_id, period").eq("org_id", activeOrg.id).in("external_uid", uids) : null,
  ];
  for (const query of blockQueries) {
    if (!query) continue;
    const res = await query;
    for (const b of res.data ?? []) {
      const start = typeof b.period === "string" ? /(\d{4}-\d{2}-\d{2})/.exec(b.period)?.[1] : undefined;
      if (start) where.set(stayMapKey({ bookingId: b.booking_id, feedId: b.feed_id, externalUid: b.external_uid }), { unitId: b.unit_id, start });
    }
  }
  return rows.data.filter((r) => r.remind_on).map((r) => {
    const stay = toStay(r);
    const place = where.get(stayMapKey({ bookingId: r.booking_id, feedId: r.feed_id, externalUid: r.external_uid }));
    return { name: stay.name, requests: stay.requests, note: stay.note, remindOn: r.remind_on as string, unitId: place?.unitId ?? null, start: place?.start ?? null };
  });
}

export { EMPTY_STAY, STAY_REQUESTS };
export type { StayKey };
