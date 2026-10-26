import "server-only";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { getPropertyId } from "@/lib/dal/content";
import { createClient } from "@/lib/supabase/server";
import type { SeasonInput, RateInput, FeeInput, PricingSection } from "@/lib/domain/rates-management";
import { quoteStay } from "@/lib/domain/pricing";
import type { z } from "zod";
import type { simulationSchema } from "@/lib/domain/rates-management";

async function getPricingContext() {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) return null;
  const supabase = await createClient();
  const propertyId = await getPropertyId(supabase, activeOrg.id);
  return propertyId ? { supabase, orgId: activeOrg.id, propertyId } : null;
}

// Every entry point resolves a verified session and active membership afresh.
// Identity and scope never come from submitted form fields. RLS remains authoritative.
export async function getPricingData() {
  const ctx = await getPricingContext();
  if (!ctx) return null;
  const { supabase, orgId, propertyId } = ctx;
  const results = await Promise.all([
    supabase.from("properties").select("currency").eq("org_id", orgId).eq("id", propertyId).single(),
    supabase.from("units").select("id,name,active,max_guests,included_guests").eq("org_id", orgId).eq("property_id", propertyId).order("name").order("id"),
    supabase.from("seasons").select("id,name,start_date,end_date,priority").eq("org_id", orgId).eq("property_id", propertyId).order("start_date").order("id"),
    supabase.from("unit_rates").select("id,unit_id,season_id,nightly_cents,weekend_nightly_cents,extra_guest_cents,min_nights").eq("org_id", orgId).eq("property_id", propertyId).order("created_at").order("id"),
    supabase.from("fees").select("id,unit_id,name,kind,amount_cents").eq("org_id", orgId).eq("property_id", propertyId).order("name").order("id"),
  ]);
  if (results.some((r) => r.error)) {
    console.error("getPricingData failed:", results.map((r) => r.error));
    throw new Error("No se pudieron cargar las tarifas.");
  }
  const [property, units, seasons, rates, fees] = results;
  if (!property.data || !units.data || !seasons.data || !rates.data || !fees.data) throw new Error("No se pudieron cargar las tarifas.");
  return {
    currency: property.data.currency,
    units: units.data.map((u) => ({ id: u.id, name: u.name, active: u.active, maxGuests: u.max_guests, includedGuests: u.included_guests })),
    seasons: seasons.data.map((s) => ({ id: s.id, name: s.name, startDate: s.start_date, endDate: s.end_date, priority: s.priority })),
    rates: rates.data.map((r) => ({ id: r.id, unitId: r.unit_id, seasonId: r.season_id, nightlyCents: r.nightly_cents, weekendNightlyCents: r.weekend_nightly_cents, extraGuestCents: r.extra_guest_cents, minNights: r.min_nights })),
    fees: fees.data.map((f) => ({ id: f.id, unitId: f.unit_id, name: f.name, kind: f.kind, amountCents: f.amount_cents })),
  };
}
export type PricingData = NonNullable<Awaited<ReturnType<typeof getPricingData>>>;
type SaveInput = { section: "seasons"; input: SeasonInput } | { section: "rates"; input: RateInput } | { section: "fees"; input: FeeInput };
type WriteResult = { ok: true } | { ok: false; error: string };
const WRITE_ERROR = "No se pudo guardar. Actualiza la página y vuelve a intentarlo.";

export async function savePricingRow(id: string | null, value: SaveInput): Promise<WriteResult> {
  const ctx = await getPricingContext();
  if (!ctx) return { ok: false, error: WRITE_ERROR };
  const { supabase, orgId, propertyId } = ctx;
  const scope = { org_id: orgId, property_id: propertyId };
  // Validate relationships before writing; composite FKs also enforce this
  // atomically. Unit identity on existing prices/fees is immutable.
  if (value.section !== "seasons") {
    const unit = await supabase.from("units").select("id").eq("org_id", orgId).eq("property_id", propertyId).eq("id", value.input.unitId).maybeSingle();
    if (unit.error || !unit.data) return { ok: false, error: WRITE_ERROR };
    if (value.section === "rates" && value.input.seasonId) {
      const season = await supabase.from("seasons").select("id").eq("org_id", orgId).eq("property_id", propertyId).eq("id", value.input.seasonId).maybeSingle();
      if (season.error || !season.data) return { ok: false, error: WRITE_ERROR };
    }
  }
  const result = await (async () => {
    if (value.section === "seasons") {
      const v = value.input;
      const fields = { name: v.name, start_date: v.startDate, end_date: v.endDate, priority: v.priority };
      return id ? supabase.from("seasons").update(fields).eq("org_id", orgId).eq("property_id", propertyId).eq("id", id).select("id")
        : supabase.from("seasons").insert({ ...scope, ...fields }).select("id");
    }
    if (value.section === "rates") {
      const v = value.input;
      const fields = { season_id: v.seasonId, nightly_cents: v.nightlyAmount, weekend_nightly_cents: v.weekendAmount, extra_guest_cents: v.extraAmount, min_nights: v.minNights };
      return id ? supabase.from("unit_rates").update(fields).eq("org_id", orgId).eq("property_id", propertyId).eq("id", id).eq("unit_id", v.unitId).select("id")
        : supabase.from("unit_rates").insert({ ...scope, ...fields, unit_id: v.unitId }).select("id");
    }
    const v = value.input;
    const fields = { name: v.name, kind: v.kind, amount_cents: v.amount };
    return id ? supabase.from("fees").update(fields).eq("org_id", orgId).eq("property_id", propertyId).eq("id", id).eq("unit_id", v.unitId).select("id")
      : supabase.from("fees").insert({ ...scope, ...fields, unit_id: v.unitId }).select("id");
  })();
  if (result.error || result.data?.length !== 1) {
    console.error("savePricingRow failed:", result.error ?? "Expected one affected row");
    if (result.error?.code === "23P01") return { ok: false, error: "Las fechas se cruzan con otra temporada de la misma prioridad. Cambia las fechas o la prioridad." };
    if (result.error?.code === "23505" && value.section === "rates") return { ok: false, error: "Ya existe una tarifa para esa unidad y temporada. Edita la existente." };
    return { ok: false, error: WRITE_ERROR };
  }
  return { ok: true };
}

export async function deletePricingRow(section: PricingSection, id: string): Promise<WriteResult> {
  const ctx = await getPricingContext();
  if (!ctx) return { ok: false, error: WRITE_ERROR };
  const table = section === "rates" ? "unit_rates" : section;
  const { data, error } = await ctx.supabase.from(table).delete().eq("org_id", ctx.orgId).eq("property_id", ctx.propertyId).eq("id", id).select("id");
  if (error || data?.length !== 1) {
    console.error("deletePricingRow failed:", error ?? "Expected one affected row");
    return { ok: false, error: "No se pudo eliminar el registro. Actualiza la página." };
  }
  return { ok: true };
}

export async function simulateSavedPricing(input: z.infer<typeof simulationSchema>) {
  const data = await getPricingData();
  const unit = data?.units.find((u) => u.id === input.unitId);
  if (!data || !unit) return null;
  // Only scenario fields come from the caller. Currency, capacity and every
  // monetary amount are loaded under the verified tenant's session and RLS.
  return quoteStay({ ...input, unit, currency: data.currency, rates: data.rates, seasons: data.seasons, fees: data.fees });
}
