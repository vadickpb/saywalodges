import "server-only";
import { cache } from "react";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { buildPublicRates, type PublicCurrency } from "@/lib/domain/public-rates";
import { todayInLima } from "@/lib/domain/dates";

// Public "from" prices (SD-208). Reads only what the anon RLS policies expose:
// seasons, rates and active units of a published property. Fees and any quote
// logic stay out; this is a presentation minimum computed per request, so a
// rate edited in the dashboard shows without a deploy and tenants never share
// cached data (cache() only dedupes inside one request, keyed by property).
export const getPublicRates = cache(async (propertyId: string, currency: PublicCurrency) => {
  const supabase = getSupabaseAnon();
  const [units, seasons, rates] = await Promise.all([
    supabase.from("units").select("id, active").eq("property_id", propertyId).eq("active", true),
    supabase.from("seasons").select("id, name, start_date, end_date").eq("property_id", propertyId),
    supabase
      .from("unit_rates")
      .select("unit_id, season_id, nightly_cents, weekend_nightly_cents")
      .eq("property_id", propertyId),
  ]);
  if (units.error || seasons.error || rates.error) {
    console.error("getPublicRates failed:", units.error ?? seasons.error ?? rates.error);
    throw new Error("No se pudieron cargar las tarifas públicas.");
  }
  return buildPublicRates({
    currency,
    units: units.data,
    seasons: seasons.data.map((s) => ({ id: s.id, name: s.name, startDate: s.start_date, endDate: s.end_date })),
    rates: rates.data.map((r) => ({
      unitId: r.unit_id,
      seasonId: r.season_id,
      nightlyCents: r.nightly_cents,
      weekendNightlyCents: r.weekend_nightly_cents,
    })),
    today: todayInLima(),
  });
});
