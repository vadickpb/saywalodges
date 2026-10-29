import "server-only";
import { requireActiveOrg } from "./organizations";
import { createClient } from "@/lib/supabase/server";
import { parseCalendarPeriod, type CalendarBlock, type ManualBlockInput } from "@/lib/domain/calendar";
import { monthBounds } from "@/lib/domain/dates";

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
  // PostgREST caps a response at 1000 rows. Read all pages; never silently show occupied days as free.
  for (let offset = 0; ; offset += 1000) {
    let query = supabase.from("calendar_blocks").select("id, unit_id, period, source, note")
      .eq("org_id", orgId).eq("property_id", propertyId).overlaps("period", period).order("id").range(offset, offset + 999);
    if (unitId) query = query.eq("unit_id", unitId);
    const { data, error: blockError } = await query;
    if (blockError) {
      console.error("readCalendar blocks failed:", blockError);
      throw new Error(CALENDAR_ERROR);
    }
    try {
      blocks.push(...data.map((row) => ({ id: row.id, unitId: row.unit_id, ...parseCalendarPeriod(row.period), source: row.source, note: row.source === "manual" ? row.note : null })));
    } catch (error) {
      console.error("readCalendar invalid period:", error);
      throw new Error(CALENDAR_ERROR);
    }
    if (data.length < 1000) break;
  }
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
