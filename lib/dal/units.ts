import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ShowcaseType, UnitInput } from "@/lib/domain/units";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

type Client = SupabaseClient<Database>;
export type Unit = UnitInput & { id: string };
type Result = { ok: true } | { ok: false };
export type UnitComponents = { parentUnitId: string | null; childUnitIds: string[] };
export type SetUnitComponentsResult = { ok: true } | { ok: false; error: string };
export const UNIT_COMPONENTS_ERROR = "No se pudo guardar la composición de la unidad. Intenta de nuevo.";
export const UNIT_COMPONENTS_OVERLAP_ERROR = "Hay reservas que chocan entre esta unidad y alguna de sus partes en las mismas fechas. Resuélvelas primero.";
export const UNIT_COMPONENTS_CHAIN_ERROR = "Una unidad no puede ser combinación y parte de otra a la vez.";
export const UNIT_COMPONENTS_OWNER_ERROR = "Solo el dueño puede configurar las unidades combinadas.";
const COLUMNS = "id, name, kind, max_guests, included_guests, active, showcase_type, description_es, description_en, bedrooms, beds, bed_details_es, bed_details_en, bathrooms, sort_order";
type UnitRow = Pick<Database["public"]["Tables"]["units"]["Row"],
  "id" | "name" | "kind" | "max_guests" | "included_guests" | "active" | "showcase_type" | "description_es" |
  "description_en" | "bedrooms" | "beds" | "bed_details_es" | "bed_details_en" | "bathrooms" | "sort_order">;

function showcaseType(value: string): ShowcaseType {
  switch (value) {
    case "apartment": case "villa": case "room": return value;
    default: return "house";
  }
}

function toUnit(row: UnitRow): Unit {
  return {
    id: row.id, name: row.name, kind: row.kind, maxGuests: row.max_guests, includedGuests: row.included_guests, active: row.active,
    showcaseType: showcaseType(row.showcase_type), descriptionEs: row.description_es, descriptionEn: row.description_en,
    bedrooms: row.bedrooms, beds: row.beds, bedDetailsEs: row.bed_details_es, bedDetailsEn: row.bed_details_en,
    bathrooms: row.bathrooms, sortOrder: row.sort_order,
  };
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
  return {
    name: input.name, kind: input.kind, max_guests: input.maxGuests, included_guests: input.includedGuests, active: input.active,
    showcase_type: input.showcaseType, description_es: input.descriptionEs, description_en: input.descriptionEn,
    bedrooms: input.bedrooms, beds: input.beds, bed_details_es: input.bedDetailsEs, bed_details_en: input.bedDetailsEn,
    bathrooms: input.bathrooms, sort_order: input.sortOrder,
  };
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

/** Read the combination involving one unit inside the organization selected by the signed-in member. */
export async function listUnitComponents(unitId: string): Promise<UnitComponents> {
  if (!z.uuid().safeParse(unitId).success) throw new Error(UNIT_COMPONENTS_ERROR);
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) throw new Error(UNIT_COMPONENTS_ERROR);
  const supabase = await createClient();
  const { data, error } = await supabase.from("unit_components").select("parent_unit_id, child_unit_id")
    .eq("org_id", activeOrg.id).or(`parent_unit_id.eq.${unitId},child_unit_id.eq.${unitId}`);
  if (error) {
    console.error("listUnitComponents failed:", error.code ?? "UNKNOWN");
    throw new Error(UNIT_COMPONENTS_ERROR);
  }
  const parent = data.find((row) => row.child_unit_id === unitId)?.parent_unit_id ?? null;
  return { parentUnitId: parent, childUnitIds: data.filter((row) => row.parent_unit_id === unitId).map((row) => row.child_unit_id) };
}

/** Replace a parent's parts using only the active organization verified from the session. */
export async function setUnitComponents(parentUnitId: string, childUnitIds: string[]): Promise<SetUnitComponentsResult> {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg || activeOrg.role !== "owner") return { ok: false, error: UNIT_COMPONENTS_OWNER_ERROR };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_unit_components", {
    p_org_id: activeOrg.id, p_parent_unit_id: parentUnitId, p_child_unit_ids: childUnitIds,
  });
  if (!error) return { ok: true };
  if (error.code === "23P01") return { ok: false, error: UNIT_COMPONENTS_OVERLAP_ERROR };
  if (error.code === "23514") return { ok: false, error: UNIT_COMPONENTS_CHAIN_ERROR };
  console.error("setUnitComponents failed:", error.code ?? "UNKNOWN");
  return { ok: false, error: UNIT_COMPONENTS_ERROR };
}
