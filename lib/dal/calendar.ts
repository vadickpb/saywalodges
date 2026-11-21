import "server-only";
import { requireActiveOrg } from "./organizations";
import { createClient } from "@/lib/supabase/server";
import { parseCalendarPeriod, type CalendarBlock, type CalendarChannel, type ManualBlockInput } from "@/lib/domain/calendar";
import { monthBounds } from "@/lib/domain/dates";
import { EMPTY_STAY, type StayDetails } from "@/lib/domain/stay-details";
import { readStayDetails, stayMapKey } from "@/lib/dal/stay-details";

export const CALENDAR_ERROR = "No se pudo completar la operación del calendario. Intenta de nuevo.";
export const OVERLAP_ERROR = "Estas fechas ya están ocupadas. Elige otro rango.";

export async function getCalendarContext() {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("properties").select("id").eq("org_id", activeOrg.id).maybeSingle();
  if (error) {
    console.error("getCalendarContext failed:", error);
    throw new Error(CALENDAR_ERROR);
  }
  return data ? { supabase, orgId: activeOrg.id, propertyId: data.id } : null;
}
type Context = NonNullable<Awaited<ReturnType<typeof getCalendarContext>>>;

export async function readCalendar(ctx: Context, month: string, unitId?: string) {
  const { supabase, orgId, propertyId } = ctx;
  const { data: units, error } = await supabase.from("units").select("id, name, active")
    .eq("org_id", orgId).eq("property_id", propertyId).order("created_at").order("id");
  if (error) {
    console.error("readCalendar units failed:", error);
    throw new Error(CALENDAR_ERROR);
  }
  if (unitId && !units.some((unit) => unit.id === unitId)) return { units, blocks: [], invalidUnit: true };
  const bounds = monthBounds(month);
  const period = bounds.endExclusive ? `[${bounds.start},${bounds.endExclusive})` : `[${bounds.start},9999-12-31]`;
  const blocks: CalendarBlock[] = [];
  const feedOfBlock = new Map<string, string>();
  // PostgREST caps a response at 1000 rows. Read all pages; never silently show occupied days as free.
  for (let offset = 0; ; offset += 1000) {
    let query = supabase.from("calendar_blocks").select("id, unit_id, period, source, note, feed_id, derived_from, booking_id, external_uid")
      .eq("org_id", orgId).eq("property_id", propertyId).overlaps("period", period).order("id").range(offset, offset + 999);
    if (unitId) query = query.eq("unit_id", unitId);
    const { data, error: blockError } = await query;
    if (blockError) {
      console.error("readCalendar blocks failed:", blockError);
      throw new Error(CALENDAR_ERROR);
    }
    try {
      blocks.push(...data.map((row) => ({ id: row.id, unitId: row.unit_id, ...parseCalendarPeriod(row.period), source: row.source, note: row.source === "manual" ? row.note : null, derived: row.derived_from !== null })));
      for (const row of data) if (row.feed_id) feedOfBlock.set(row.id, row.feed_id);
      for (const row of data) {
        const block = blocks.find((b) => b.id === row.id);
        if (!block) continue;
        if (row.source === "booking" && row.booking_id) block.stayKey = { kind: "booking", bookingId: row.booking_id };
        else if (row.source === "ical" && row.feed_id && row.external_uid && /^[a-f0-9]{64}$/.test(row.external_uid)) block.stayKey = { kind: "ical", feedId: row.feed_id, externalUid: row.external_uid };
      }
    } catch (error) {
      console.error("readCalendar invalid period:", error);
      throw new Error(CALENDAR_ERROR);
    }
    if (data.length < 1000) break;
  }
  // Channel of each iCal feed (Airbnb, Booking, Vrbo). Feeds are owner-only (RLS): for staff this returns nothing
  // and iCal blocks stay "canal sin identificar". A failure here must never hide occupied dates, so it only
  // drops the label.
  if (feedOfBlock.size > 0) {
    const { data: feeds, error: feedError } = await supabase.from("ical_feeds").select("id, channel").eq("org_id", orgId);
    if (feedError) console.error("readCalendar feeds failed:", feedError);
    else {
      const channelByFeed = new Map(feeds.map((feed) => [feed.id, feed.channel]));
      for (const block of blocks) {
        const feedId = feedOfBlock.get(block.id);
        if (feedId) block.channel = channelByFeed.get(feedId) ?? null;
      }
    }
  }
  await attachStayDetails(supabase, orgId, blocks);
  return { units, blocks, invalidUnit: false };
}

export async function createManualBlock(ctx: Context, input: ManualBlockInput) {
  // No availability preflight: the exclusion constraint is the only overlap authority.
  const { data, error } = await ctx.supabase.rpc("create_manual_calendar_block", {
    p_org_id: ctx.orgId, p_unit_id: input.unitId, p_start: input.start, p_end: input.end, p_note: input.note || undefined,
  });
  if (error?.code === "23P01") return { ok: false, error: OVERLAP_ERROR } as const;
  if (error || !data) {
    console.error("createManualBlock failed:", error ?? "Missing block id");
    return { ok: false, error: CALENDAR_ERROR } as const;
  }
  return { ok: true } as const;
}

export async function deleteManualBlock(ctx: Context, id: string) {
  const { error } = await ctx.supabase.rpc("delete_manual_calendar_block", { p_org_id: ctx.orgId, p_block_id: id });
  if (error) {
    console.error("deleteManualBlock failed:", error);
    return { ok: false, error: CALENDAR_ERROR } as const;
  }
  return { ok: true } as const;
}

/**
 * SD-1129: what the owner saved for each stay of the month. For a web/manual booking with nothing saved yet, the form starts from
 * the booking's own data (name, phone, guests, language) so the owner only confirms. A failure here never hides occupied dates.
 */
async function attachStayDetails(supabase: Context["supabase"], orgId: string, blocks: CalendarBlock[]) {
  const withKey = blocks.filter((b) => b.stayKey);
  if (withKey.length === 0) return;
  const bookingIds = withKey.flatMap((b) => (b.stayKey?.kind === "booking" ? [b.stayKey.bookingId] : []));
  const externalUids = withKey.flatMap((b) => (b.stayKey?.kind === "ical" ? [b.stayKey.externalUid] : []));
  const saved = await readStayDetails(supabase, orgId, { bookingIds, externalUids });
  const defaults = new Map<string, StayDetails>();
  if (bookingIds.length > 0) {
    const { data, error } = await supabase.from("bookings").select("id, guest_name, guest_phone, guests, email_lang, guest_id").eq("org_id", orgId).in("id", bookingIds);
    if (error) console.error("readCalendar bookings failed:", error.code);
    const guestIds = [...new Set((data ?? []).map((b) => b.guest_id))];
    const names = new Map<string, string>();
    if (guestIds.length > 0) {
      const guests = await supabase.from("guests").select("id, name").eq("org_id", orgId).in("id", guestIds);
      for (const g of guests.data ?? []) names.set(g.id, g.name);
    }
    for (const b of data ?? []) {
      defaults.set(stayMapKey({ bookingId: b.id }), { ...EMPTY_STAY, name: b.guest_name ?? names.get(b.guest_id) ?? null, phone: b.guest_phone, party: b.guests, lang: b.email_lang === "en" ? "en" : "es" });
    }
  }
  for (const block of withKey) {
    const key = block.stayKey!;
    const mapKey = stayMapKey(key.kind === "booking" ? { bookingId: key.bookingId } : { feedId: key.feedId, externalUid: key.externalUid });
    block.stay = saved.get(mapKey) ?? defaults.get(mapKey) ?? EMPTY_STAY;
  }
}
