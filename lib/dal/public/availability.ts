import "server-only";
import { cache } from "react";
import { z } from "zod";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { dateRange, type DateRange } from "@/lib/domain/availability";
import { monthWindow } from "@/lib/domain/public-availability";
import type { IsoMonth } from "@/lib/domain/dates";

// Public occupancy for the tenant site (SD-308). The only anonymous path to
// calendar_blocks is the get_public_unit_availability RPC, which answers with bare
// date ranges for an active unit of a published property. Callers pass the property
// and unit they resolved from the host; the RPC checks that they belong together.

const rowsSchema = z.array(z.object({ start_date: z.string(), end_date: z.string() }));

export const PUBLIC_AVAILABILITY_ERROR = "No se pudo cargar la disponibilidad.";

/** Occupied ranges of `month`, or null when the unit is not publicly bookable. */
export const getPublicUnitAvailability = cache(
  async (propertyId: string, unitId: string, month: IsoMonth): Promise<DateRange[] | null> => {
    const window = monthWindow(month);
    const { data, error } = await getSupabaseAnon().rpc("get_public_unit_availability", {
      p_property_id: propertyId,
      p_unit_id: unitId,
      p_from: window.start,
      p_to: window.end,
    });
    if (error) {
      // 42501: unknown / inactive unit or unpublished property. Not an outage.
      if (error.code === "42501") return null;
      console.error("getPublicUnitAvailability failed:", error.code);
      throw new Error(PUBLIC_AVAILABILITY_ERROR);
    }
    const rows = rowsSchema.safeParse(data);
    if (!rows.success) {
      console.error("getPublicUnitAvailability: unexpected payload");
      throw new Error(PUBLIC_AVAILABILITY_ERROR);
    }
    return rows.data.map((row) => dateRange(row.start_date, row.end_date));
  },
);
