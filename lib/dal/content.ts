import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { AmenityInput, DistanceInput, SpaceCategory, SpaceInput } from "@/lib/domain/content-manager";

// Member-only reads/writes of a property's spaces, amenities and distances
// (the session client + RLS `is_member(org_id)`; never service-role). Same
// conventions as lib/dal/property.ts: orgId always comes from
// requireActiveOrg(), every query also filters `.eq("org_id", orgId)` as
// defense in depth, writes verify the affected-row count (RLS filtering a
// cross-org write returns 0 rows with no error), and the caller gets a
// generic {ok:false} while the DB error is only logged.

type Client = SupabaseClient<Database>;
export type Result<T = object> = ({ ok: true } & T) | { ok: false; duplicateKey?: boolean };

// The one property of an org (properties.org_id is unique). Children need its
// id on insert and for the reorder RPCs.
export async function getPropertyId(supabase: Client, orgId: string): Promise<string | null> {
  const { data, error } = await supabase.from("properties").select("id").eq("org_id", orgId).maybeSingle();
  if (error) {
    console.error("getPropertyId failed:", error);
    return null;
  }
  return data?.id ?? null;
}

async function nextSortOrder(
  supabase: Client,
  table: "spaces" | "amenities" | "distances",
  orgId: string,
  propertyId: string
): Promise<number> {
  const { data } = await supabase
    .from(table)
    .select("sort_order")
    .eq("org_id", orgId)
    .eq("property_id", propertyId)
    .order("sort_order", { ascending: false })
    .limit(1);
  return (data?.[0]?.sort_order ?? -1) + 1;
}

const UNIQUE_VIOLATION = "23505";

// ─── Spaces ─────────────────────────────────────────────────────────────────

export type SpaceItem = SpaceInput & { id: string; sortOrder: number };

function toSpaceItem(r: Database["public"]["Tables"]["spaces"]["Row"]): SpaceItem {
  return {
    id: r.id,
    key: r.key,
    category: r.category as SpaceCategory,
    icon: r.icon,
    capacity: r.capacity,
    badgeEn: r.badge_en,
    badgeEs: r.badge_es,
    labelEn: r.label_en,
    labelEs: r.label_es,
    descEn: r.desc_en,
    descEs: r.desc_es,
    sortOrder: r.sort_order,
  };
}

export async function listSpaces(supabase: Client, orgId: string): Promise<SpaceItem[]> {
  const { data, error } = await supabase.from("spaces").select("*").eq("org_id", orgId).order("sort_order");
  if (error) {
    console.error("listSpaces failed:", error);
    return [];
  }
  return data.map(toSpaceItem);
}

export async function getSpace(supabase: Client, orgId: string, id: string): Promise<SpaceItem | null> {
  const { data, error } = await supabase.from("spaces").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) {
    console.error("getSpace failed:", error);
    return null;
  }
  return data ? toSpaceItem(data) : null;
}

function spaceColumns(s: SpaceInput) {
  return {
    key: s.key,
    category: s.category,
    icon: s.icon,
    capacity: s.capacity,
    badge_en: s.badgeEn,
    badge_es: s.badgeEs,
    label_en: s.labelEn,
    label_es: s.labelEs,
    desc_en: s.descEn,
    desc_es: s.descEs,
  };
}

export async function createSpace(
  supabase: Client,
  orgId: string,
  propertyId: string,
  input: SpaceInput
): Promise<Result<{ id: string }>> {
  const sortOrder = await nextSortOrder(supabase, "spaces", orgId, propertyId);
  const { data, error } = await supabase
    .from("spaces")
    .insert({ ...spaceColumns(input), org_id: orgId, property_id: propertyId, sort_order: sortOrder })
    .select("id")
    .single();
  if (error) {
    if (error.code !== UNIQUE_VIOLATION) console.error("createSpace failed:", error);
    return { ok: false, duplicateKey: error.code === UNIQUE_VIOLATION };
  }
  return { ok: true, id: data.id };
}

export async function updateSpace(supabase: Client, orgId: string, id: string, input: SpaceInput): Promise<Result> {
  const { data, error } = await supabase
    .from("spaces")
    .update(spaceColumns(input))
    .eq("org_id", orgId)
    .eq("id", id)
    .select("id");
  if (error) {
    if (error.code !== UNIQUE_VIOLATION) console.error("updateSpace failed:", error);
    return { ok: false, duplicateKey: error.code === UNIQUE_VIOLATION };
  }
  if (data.length !== 1) {
    console.error(`updateSpace: expected 1 row for space ${id} in org ${orgId}, got ${data.length}`);
    return { ok: false };
  }
  return { ok: true };
}

// Row delete only: lib/dal/photos.ts#deleteSpaceWithPhotos removes the
// Storage objects first, because the FK cascade deletes photo rows but never
// objects.
export async function deleteSpaceRow(supabase: Client, orgId: string, id: string): Promise<Result> {
  const { data, error } = await supabase.from("spaces").delete().eq("org_id", orgId).eq("id", id).select("id");
  if (error) {
    console.error("deleteSpaceRow failed:", error);
    return { ok: false };
  }
  if (data.length !== 1) {
    console.error(`deleteSpaceRow: expected 1 row for space ${id} in org ${orgId}, got ${data.length}`);
    return { ok: false };
  }
  return { ok: true };
}

// ─── Amenities ──────────────────────────────────────────────────────────────

export type AmenityItem = AmenityInput & { id: string; sortOrder: number };

export async function listAmenities(supabase: Client, orgId: string): Promise<AmenityItem[]> {
  const { data, error } = await supabase.from("amenities").select("*").eq("org_id", orgId).order("sort_order");
  if (error) {
    console.error("listAmenities failed:", error);
    return [];
  }
  return data.map((r) => ({
    id: r.id,
    icon: r.icon,
    titleEn: r.title_en,
    titleEs: r.title_es,
    descEn: r.desc_en,
    descEs: r.desc_es,
    sortOrder: r.sort_order,
  }));
}

function amenityColumns(a: AmenityInput) {
  return { icon: a.icon, title_en: a.titleEn, title_es: a.titleEs, desc_en: a.descEn, desc_es: a.descEs };
}

export async function createAmenity(
  supabase: Client,
  orgId: string,
  propertyId: string,
  input: AmenityInput
): Promise<Result> {
  const sortOrder = await nextSortOrder(supabase, "amenities", orgId, propertyId);
  const { error } = await supabase
    .from("amenities")
    .insert({ ...amenityColumns(input), org_id: orgId, property_id: propertyId, sort_order: sortOrder });
  if (error) {
    console.error("createAmenity failed:", error);
    return { ok: false };
  }
  return { ok: true };
}

export async function updateAmenity(supabase: Client, orgId: string, id: string, input: AmenityInput): Promise<Result> {
  const { data, error } = await supabase
    .from("amenities")
    .update(amenityColumns(input))
    .eq("org_id", orgId)
    .eq("id", id)
    .select("id");
  if (error || data.length !== 1) {
    console.error("updateAmenity failed:", error ?? `expected 1 row, got ${data?.length}`);
    return { ok: false };
  }
  return { ok: true };
}

export async function deleteAmenity(supabase: Client, orgId: string, id: string): Promise<Result> {
  const { data, error } = await supabase.from("amenities").delete().eq("org_id", orgId).eq("id", id).select("id");
  if (error || data.length !== 1) {
    console.error("deleteAmenity failed:", error ?? `expected 1 row, got ${data?.length}`);
    return { ok: false };
  }
  return { ok: true };
}

// ─── Distances ──────────────────────────────────────────────────────────────

export type DistanceItem = DistanceInput & { id: string; sortOrder: number };

export async function listDistances(supabase: Client, orgId: string): Promise<DistanceItem[]> {
  const { data, error } = await supabase.from("distances").select("*").eq("org_id", orgId).order("sort_order");
  if (error) {
    console.error("listDistances failed:", error);
    return [];
  }
  return data.map((r) => ({
    id: r.id,
    placeEn: r.place_en,
    placeEs: r.place_es,
    timeEn: r.time_en,
    timeEs: r.time_es,
    icon: r.icon,
    sortOrder: r.sort_order,
  }));
}

function distanceColumns(d: DistanceInput) {
  return { place_en: d.placeEn, place_es: d.placeEs, time_en: d.timeEn, time_es: d.timeEs, icon: d.icon };
}

export async function createDistance(
  supabase: Client,
  orgId: string,
  propertyId: string,
  input: DistanceInput
): Promise<Result> {
  const sortOrder = await nextSortOrder(supabase, "distances", orgId, propertyId);
  const { error } = await supabase
    .from("distances")
    .insert({ ...distanceColumns(input), org_id: orgId, property_id: propertyId, sort_order: sortOrder });
  if (error) {
    console.error("createDistance failed:", error);
    return { ok: false };
  }
  return { ok: true };
}

export async function updateDistance(supabase: Client, orgId: string, id: string, input: DistanceInput): Promise<Result> {
  const { data, error } = await supabase
    .from("distances")
    .update(distanceColumns(input))
    .eq("org_id", orgId)
    .eq("id", id)
    .select("id");
  if (error || data.length !== 1) {
    console.error("updateDistance failed:", error ?? `expected 1 row, got ${data?.length}`);
    return { ok: false };
  }
  return { ok: true };
}

export async function deleteDistance(supabase: Client, orgId: string, id: string): Promise<Result> {
  const { data, error } = await supabase.from("distances").delete().eq("org_id", orgId).eq("id", id).select("id");
  if (error || data.length !== 1) {
    console.error("deleteDistance failed:", error ?? `expected 1 row, got ${data?.length}`);
    return { ok: false };
  }
  return { ok: true };
}

// ─── Ordering (transactional RPCs, SECURITY INVOKER → RLS applies) ──────────

// `ids` is the complete new order. The RPC returns how many rows it changed;
// anything other than ids.length means an id was foreign/unknown, so the whole
// call is reported as failed instead of half-applied (it ran in one statement,
// but a wrong id means the caller's view of the list was stale or forged).
export async function reorderItems(
  supabase: Client,
  kind: "spaces" | "amenities" | "distances",
  propertyId: string,
  ids: string[]
): Promise<Result> {
  const rpc =
    kind === "spaces" ? "reorder_spaces" : kind === "amenities" ? "reorder_amenities" : "reorder_distances";
  const { data, error } = await supabase.rpc(rpc, { p_property_id: propertyId, p_ids: ids });
  if (error) {
    console.error(`${rpc} failed:`, error);
    return { ok: false };
  }
  if (data !== ids.length) {
    console.error(`${rpc}: expected ${ids.length} rows, changed ${data}`);
    return { ok: false };
  }
  return { ok: true };
}
