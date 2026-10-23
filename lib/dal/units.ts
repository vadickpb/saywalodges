import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { UnitInput } from "@/lib/domain/units";

type Client = SupabaseClient<Database>;
export type Unit = UnitInput & { id: string };
type Result = { ok: true } | { ok: false };
const COLUMNS = "id, name, kind, max_guests, included_guests, active";

function toUnit(row: Pick<Database["public"]["Tables"]["units"]["Row"], "id" | "name" | "kind" | "max_guests" | "included_guests" | "active">): Unit {
  return { id: row.id, name: row.name, kind: row.kind, maxGuests: row.max_guests, includedGuests: row.included_guests, active: row.active };
}

// Callers resolve orgId through requireActiveOrg(), never a client cookie or
// input. Session-client RLS is authoritative; explicit org filters add scope.
export async function listUnits(supabase: Client, orgId: string): Promise<Unit[]> {
  const { data, error } = await supabase.from("units").select(COLUMNS).eq("org_id", orgId).order("created_at").order("id");
  if (error) {
    console.error("listUnits failed:", error);
    throw new Error("No se pudieron cargar las unidades.");
  }
  return data.map(toUnit);
}

export async function getUnit(supabase: Client, orgId: string, id: string): Promise<Unit | null> {
  const { data, error } = await supabase.from("units").select(COLUMNS).eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) {
    console.error("getUnit failed:", error);
    throw new Error("No se pudo cargar la unidad.");
  }
  return data ? toUnit(data) : null;
}

function columns(input: UnitInput) {
  return { name: input.name, kind: input.kind, max_guests: input.maxGuests, included_guests: input.includedGuests, active: input.active };
}

export async function createUnit(supabase: Client, orgId: string, propertyId: string, input: UnitInput): Promise<Result> {
  const { data, error } = await supabase.from("units").insert({ ...columns(input), org_id: orgId, property_id: propertyId }).select("id").single();
  if (error || !data) {
    console.error("createUnit failed:", error);
    return { ok: false };
  }
  return { ok: true };
}

export async function updateUnit(supabase: Client, orgId: string, id: string, input: UnitInput): Promise<Result> {
  const { data, error } = await supabase.from("units").update(columns(input)).eq("org_id", orgId).eq("id", id).select("id");
  if (error || data?.length !== 1) {
    console.error("updateUnit failed:", error ?? "Expected one affected unit");
    return { ok: false };
  }
  return { ok: true };
}

export async function setUnitActive(supabase: Client, orgId: string, id: string, active: boolean): Promise<Result> {
  const { data, error } = await supabase.from("units").update({ active }).eq("org_id", orgId).eq("id", id).select("id");
  if (error || data?.length !== 1) {
    console.error("setUnitActive failed:", error ?? "Expected one affected unit");
    return { ok: false };
  }
  return { ok: true };
}

export async function deleteUnit(supabase: Client, orgId: string, id: string): Promise<Result> {
  const { data, error } = await supabase.from("units").delete().eq("org_id", orgId).eq("id", id).select("id");
  if (error || data?.length !== 1) {
    console.error("deleteUnit failed:", error ?? "Expected one affected unit");
    return { ok: false };
  }
  return { ok: true };
}
