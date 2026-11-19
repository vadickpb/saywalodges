import "server-only";
import { cache } from "react";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { getPublicPhotoUrl } from "@/lib/storage";
import type { ShowcaseType } from "@/lib/domain/units";

export type ShowcaseSpace = {
  id: string;
  category: "pool" | "rooms" | "common" | "outdoor";
  icon: string;
  labelEn: string;
  labelEs: string;
  descriptionEn: string;
  descriptionEs: string;
  capacity: string | null;
  badgeEn: string | null;
  badgeEs: string | null;
  photos: string[];
};

export type ShowcaseUnit = {
  id: string;
  name: string;
  showcaseType: ShowcaseType;
  descriptionEn: string;
  descriptionEs: string;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bedDetailsEn: string;
  bedDetailsEs: string;
  bathrooms: number;
  sortOrder: number;
  cover: string;
  /** Ids of the units this one is made of (a combined unit such as the entire villa); empty otherwise. */
  partIds: string[];
  fromCents: number | null;
  spaces: ShowcaseSpace[];
};

function showcaseType(value: string): ShowcaseType {
  switch (value) {
    case "apartment": case "villa": case "room": return value;
    default: return "house";
  }
}

export const getShowcaseUnits = cache(async (propertyId: string): Promise<ShowcaseUnit[]> => {
  const supabase = getSupabaseAnon();
  const [unitsResult, spacesResult, photosResult, ratesResult, componentsResult] = await Promise.all([
    supabase.from("units")
      .select("id, name, showcase_type, description_en, description_es, max_guests, bedrooms, beds, bed_details_en, bed_details_es, bathrooms, sort_order, created_at")
      .eq("property_id", propertyId).eq("active", true).order("sort_order").order("created_at").order("id"),
    supabase.from("spaces")
      .select("id, unit_id, category, icon, label_en, label_es, desc_en, desc_es, capacity, badge_en, badge_es, sort_order")
      .eq("property_id", propertyId).order("sort_order").order("id"),
    supabase.from("photos")
      .select("space_id, storage_path, sort_order").eq("property_id", propertyId).eq("role", "room").order("sort_order").order("id"),
    supabase.from("unit_rates")
      .select("unit_id, nightly_cents, weekend_nightly_cents").eq("property_id", propertyId).is("season_id", null),
    supabase.from("unit_components").select("parent_unit_id, child_unit_id").eq("property_id", propertyId),
  ]);

  const error = unitsResult.error ?? spacesResult.error ?? photosResult.error ?? ratesResult.error ?? componentsResult.error;
  if (error) {
    console.error("getShowcaseUnits failed:", error.code);
    throw new Error("No se pudieron cargar los alojamientos.");
  }

  const photosBySpace = new Map<string, string[]>();
  for (const photo of photosResult.data ?? []) {
    if (!photo.space_id) continue;
    const photos = photosBySpace.get(photo.space_id) ?? [];
    photos.push(getPublicPhotoUrl(photo.storage_path));
    photosBySpace.set(photo.space_id, photos);
  }

  const spacesByUnit = new Map<string, ShowcaseSpace[]>();
  for (const space of spacesResult.data ?? []) {
    if (!space.unit_id) continue;
    const spaces = spacesByUnit.get(space.unit_id) ?? [];
    spaces.push({
      id: space.id, category: space.category, icon: space.icon, labelEn: space.label_en, labelEs: space.label_es,
      descriptionEn: space.desc_en, descriptionEs: space.desc_es, capacity: space.capacity,
      badgeEn: space.badge_en, badgeEs: space.badge_es, photos: photosBySpace.get(space.id) ?? [],
    });
    spacesByUnit.set(space.unit_id, spaces);
  }

  const partsByUnit = new Map<string, string[]>();
  for (const component of componentsResult.data ?? []) {
    partsByUnit.set(component.parent_unit_id, [...(partsByUnit.get(component.parent_unit_id) ?? []), component.child_unit_id]);
  }

  const rateByUnit = new Map<string, number>();
  for (const rate of ratesResult.data ?? []) {
    const candidates = [rate.nightly_cents, rate.weekend_nightly_cents].filter((value): value is number => value !== null);
    const minimum = Math.min(...candidates);
    const current = rateByUnit.get(rate.unit_id);
    if (current === undefined || minimum < current) rateByUnit.set(rate.unit_id, minimum);
  }

  return (unitsResult.data ?? []).map((unit) => {
    const spaces = spacesByUnit.get(unit.id) ?? [];
    return {
      id: unit.id, name: unit.name, showcaseType: showcaseType(unit.showcase_type),
      descriptionEn: unit.description_en, descriptionEs: unit.description_es, maxGuests: unit.max_guests,
      bedrooms: unit.bedrooms, beds: unit.beds, bedDetailsEn: unit.bed_details_en, bedDetailsEs: unit.bed_details_es,
      bathrooms: unit.bathrooms, sortOrder: unit.sort_order, cover: spaces[0]?.photos[0] ?? "", partIds: partsByUnit.get(unit.id) ?? [],
      fromCents: rateByUnit.get(unit.id) ?? null, spaces,
    };
  });
});

export const getShowcaseUnit = cache(async (propertyId: string, unitId: string): Promise<ShowcaseUnit | null> =>
  (await getShowcaseUnits(propertyId)).find((unit) => unit.id === unitId) ?? null
);
