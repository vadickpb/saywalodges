import "server-only";
import { cache } from "react";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { getPublicUnitAvailabilityForRange } from "./availability";
import { daysBetween } from "@/lib/domain/dates";
import { quoteStay } from "@/lib/domain/pricing";
import { resolveSpecialDateStatus, specialDateHorizon, type SpecialDateStatus } from "@/lib/domain/special-dates";

export type PublicSpecialDateUnit = {
  id: string;
  name: string;
  status: SpecialDateStatus;
  minNights: number | null;
  totalCents: number | null;
};

export type PublicSpecialDate = {
  id: string;
  publicNameEs: string;
  publicNameEn: string;
  startDate: string;
  endDate: string;
  nights: number;
  currency: "PEN" | "USD";
  units: PublicSpecialDateUnit[];
};

export const getSpecialDates = cache(async (propertyId: string, todayLima: string): Promise<PublicSpecialDate[]> => {
  const supabase = getSupabaseAnon();
  const { data: specialSeasons, error: specialError } = await supabase
    .from("seasons")
    .select("id,public_name_es,public_name_en,start_date,end_date")
    .eq("property_id", propertyId)
    .eq("is_special", true)
    .gt("end_date", todayLima)
    .lte("end_date", specialDateHorizon(todayLima))
    .order("start_date")
    .order("id");
  if (specialError || !specialSeasons) {
    console.error("getSpecialDates failed:", specialError);
    throw new Error("No se pudieron cargar las fechas especiales.");
  }
  if (specialSeasons.length === 0) return [];

  const [property, units, seasons, rates, fees, priceRanges] = await Promise.all([
    supabase.from("properties").select("currency").eq("id", propertyId).single(),
    supabase.from("units").select("id,name,active,max_guests,included_guests").eq("property_id", propertyId).eq("active", true).order("created_at").order("id"),
    supabase.from("seasons").select("id,start_date,end_date,priority").eq("property_id", propertyId),
    supabase.from("unit_rates").select("id,unit_id,season_id,nightly_cents,weekend_nightly_cents,extra_guest_cents,min_nights").eq("property_id", propertyId),
    supabase.from("fees").select("id,unit_id,name,kind,amount_cents").eq("property_id", propertyId),
    supabase.from("unit_price_overrides").select("unit_id,start_date,end_date,nightly_cents,min_nights").eq("property_id", propertyId),
  ]);
  const results = [property, units, seasons, rates, fees, priceRanges];
  if (results.some((result) => result.error) || !property.data || !units.data || !seasons.data || !rates.data || !fees.data || !priceRanges.data) {
    console.error("getSpecialDates pricing failed:", results.map((result) => result.error));
    throw new Error("No se pudieron cargar las fechas especiales.");
  }
  const currency = property.data.currency;
  const publicUnits = units.data;
  const publicSeasons = seasons.data;
  const publicRates = rates.data;
  const publicFees = fees.data;
  const publicPriceRanges = priceRanges.data;

  const pricingSeasons = publicSeasons.map((season) => ({
    id: season.id, startDate: season.start_date, endDate: season.end_date, priority: season.priority,
  }));
  const pricingRates = publicRates.map((rate) => ({
    id: rate.id, unitId: rate.unit_id, seasonId: rate.season_id, nightlyCents: rate.nightly_cents,
    weekendNightlyCents: rate.weekend_nightly_cents, extraGuestCents: rate.extra_guest_cents, minNights: rate.min_nights,
  }));
  const pricingFees = publicFees.map((fee) => ({
    id: fee.id, unitId: fee.unit_id, name: fee.name, kind: fee.kind, amountCents: fee.amount_cents,
  }));
  const pricingRanges = publicPriceRanges.map((range) => ({
    unitId: range.unit_id, startDate: range.start_date, endDate: range.end_date,
    nightlyCents: range.nightly_cents, minNights: range.min_nights,
  }));

  return Promise.all(specialSeasons.map(async (special): Promise<PublicSpecialDate> => {
    const specialUnits = await Promise.all(publicUnits.map(async (unit): Promise<PublicSpecialDateUnit> => {
      const occupiedRanges = special.start_date < todayLima
        ? null
        : await getPublicUnitAvailabilityForRange(propertyId, unit.id, special.start_date, special.end_date);
      const availability = occupiedRanges === null ? null : occupiedRanges.length === 0;
      const priced = quoteStay({
        unit: { id: unit.id, active: unit.active, maxGuests: unit.max_guests, includedGuests: unit.included_guests },
        currency,
        depositPercent: 0,
        checkIn: special.start_date,
        checkOut: special.end_date,
        guests: unit.included_guests,
        rates: pricingRates,
        seasons: pricingSeasons,
        fees: pricingFees,
        priceRanges: pricingRanges,
      });
      const totalCents = priced.ok ? priced.quote.totalCents : null;
      const firstRateId = priced.ok ? priced.quote.nights[0]?.rateId : undefined;
      const firstRate = firstRateId ? pricingRates.find((rate) => rate.id === firstRateId) : undefined;
      const firstRange = pricingRanges.find((range) => range.unitId === unit.id && special.start_date >= range.startDate && special.start_date < range.endDate);
      const minNights = priced.ok ? (firstRange?.minNights ?? firstRate?.minNights ?? null)
        : priced.error.code === "MIN_NIGHTS" ? priced.error.requiredNights : null;
      const status = resolveSpecialDateStatus(availability, totalCents);
      return { id: unit.id, name: unit.name, status, minNights, totalCents: status === "inquire" ? null : totalCents };
    }));
    return {
      id: special.id,
      publicNameEs: special.public_name_es,
      publicNameEn: special.public_name_en,
      startDate: special.start_date,
      endDate: special.end_date,
      nights: daysBetween(special.start_date, special.end_date),
      currency,
      units: specialUnits,
    };
  }));
});
