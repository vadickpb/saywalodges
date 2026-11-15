import "server-only";
import { cache } from "react";
import { z } from "zod";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { dateRange, type DateRange } from "@/lib/domain/availability";
import { monthWindow } from "@/lib/domain/public-availability";
import { addDays, daysBetween, type IsoMonth } from "@/lib/domain/dates";

// Public occupancy for the tenant site (SD-308). The only anonymous path to
// calendar_blocks is the get_public_unit_availability RPC, which answers with bare
// date ranges for an active unit of a published property. Callers pass the property
// and unit they resolved from the host; the RPC checks that they belong together.

const rowsSchema = z.array(z.object({ start_date: z.string(), end_date: z.string() }));

export const PUBLIC_AVAILABILITY_ERROR = "No se pudo cargar la disponibilidad.";

const getPublicAvailabilityWindow = cache(
  async (propertyId: string, unitId: string, start: string, end: string): Promise<DateRange[] | null> => {
    const { data, error } = await getSupabaseAnon().rpc("get_public_unit_availability", {
      p_property_id: propertyId,
      p_unit_id: unitId,
      p_from: start,
      p_to: end,
    });
    if (error) {
      if (error.code === "42501") return null;
      console.error("getPublicAvailabilityWindow failed:", error.code);
      throw new Error(PUBLIC_AVAILABILITY_ERROR);
    }
    const rows = rowsSchema.safeParse(data);
    if (!rows.success) {
      console.error("getPublicAvailabilityWindow: unexpected payload");
      throw new Error(PUBLIC_AVAILABILITY_ERROR);
    }
    return rows.data.map((row) => dateRange(row.start_date, row.end_date));
  },
);

/** Occupied ranges of `month`, or null when the unit is not publicly bookable. */
export const getPublicUnitAvailability = cache(
  async (propertyId: string, unitId: string, month: IsoMonth): Promise<DateRange[] | null> => {
    const window = monthWindow(month);
    return getPublicAvailabilityWindow(propertyId, unitId, window.start, window.end);
  },
);

/** Occupied ranges for a complete stay, split to respect the public RPC's 62-day limit. */
export async function getPublicUnitAvailabilityForRange(propertyId: string, unitId: string, start: string, end: string): Promise<DateRange[] | null> {
  const nights = daysBetween(start, end);
  if (nights <= 0) throw new Error(PUBLIC_AVAILABILITY_ERROR);
  const ranges: DateRange[] = [];
  let cursor = start;
  while (cursor < end) {
    const next = addDays(cursor, Math.min(62, daysBetween(cursor, end)));
    const chunk = await getPublicAvailabilityWindow(propertyId, unitId, cursor, next);
    if (chunk === null) return null;
    ranges.push(...chunk);
    cursor = next;
  }
  return ranges;
}
