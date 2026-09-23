import { getSupabase, getPublicPhotoUrl } from "./supabase";

// Single-tenant for now — Phase 1 (multi-tenant) resolves this from the request's
// domain/subdomain instead of a constant.
const PROPERTY_SLUG = "saywa-lodges";

export type Property = {
  id: string;
  slug: string;
  name: string;
  whatsappNumber: string;
  whatsappMessageEn: string;
  whatsappMessageEs: string;
  email: string;
  mapsUrl: string;
  airbnbUrl: string;
  siteUrl: string;
  addressLocality: string;
  addressRegion: string;
  addressCountry: string;
  latitude: number | null;
  longitude: number | null;
  metaTitleEn: string;
  metaTitleEs: string;
  metaDescriptionEn: string;
  metaDescriptionEs: string;
  metaKeywordsEn: string[];
  metaKeywordsEs: string[];
  priceRange: string;
  starRating: number | null;
  petsAllowed: boolean;
  logoUrl: string;
};

export async function getProperty(): Promise<Property> {
  const { data, error } = await getSupabase()
    .from("properties")
    .select(
      "id, slug, name, whatsapp_number, whatsapp_message_en, whatsapp_message_es, email, maps_url, airbnb_url, site_url, address_locality, address_region, address_country, latitude, longitude, meta_title_en, meta_title_es, meta_description_en, meta_description_es, meta_keywords_en, meta_keywords_es, price_range, star_rating, pets_allowed, logo_path"
    )
    .eq("slug", PROPERTY_SLUG)
    .single();

  if (error || !data) throw new Error(`Property not found: ${error?.message ?? "no rows"}`);

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    whatsappNumber: data.whatsapp_number,
    whatsappMessageEn: data.whatsapp_message_en,
    whatsappMessageEs: data.whatsapp_message_es,
    email: data.email,
    mapsUrl: data.maps_url,
    airbnbUrl: data.airbnb_url,
    siteUrl: data.site_url,
    addressLocality: data.address_locality,
    addressRegion: data.address_region,
    addressCountry: data.address_country,
    latitude: data.latitude,
    longitude: data.longitude,
    metaTitleEn: data.meta_title_en,
    metaTitleEs: data.meta_title_es,
    metaDescriptionEn: data.meta_description_en,
    metaDescriptionEs: data.meta_description_es,
    metaKeywordsEn: data.meta_keywords_en ?? [],
    metaKeywordsEs: data.meta_keywords_es ?? [],
    priceRange: data.price_range,
    starRating: data.star_rating,
    petsAllowed: data.pets_allowed,
    logoUrl: data.logo_path ? getPublicPhotoUrl(data.logo_path) : "",
  };
}

export function whatsappUrl(property: Property, lang: string): string {
  const message = lang === "es" ? property.whatsappMessageEs : property.whatsappMessageEn;
  return `https://wa.me/${property.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

// ─── Rate tiers ──────────────────────────────────────────────────────────────

export type RateTierRow = {
  id: string;
  season_en: string;
  season_es: string;
  from_en: string;
  from_es: string;
  period_en: string;
  period_es: string;
  tag_en: string;
  tag_es: string;
  sort_order: number;
};

export async function getRateTiers(propertyId: string): Promise<RateTierRow[]> {
  const { data, error } = await getSupabase()
    .from("rate_tiers")
    .select("*")
    .eq("property_id", propertyId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function resolveRateTier(row: RateTierRow, lang: string) {
  const isEs = lang === "es";
  return {
    season: isEs ? row.season_es : row.season_en,
    from: isEs ? row.from_es : row.from_en,
    period: isEs ? row.period_es : row.period_en,
    tag: isEs ? row.tag_es : row.tag_en,
  };
}

// ─── Amenities ───────────────────────────────────────────────────────────────

export type AmenityRow = {
  id: string;
  icon: string;
  title_en: string;
  title_es: string;
  desc_en: string;
  desc_es: string;
  sort_order: number;
};

export async function getAmenities(propertyId: string): Promise<AmenityRow[]> {
  const { data, error } = await getSupabase()
    .from("amenities")
    .select("*")
    .eq("property_id", propertyId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function resolveAmenity(row: AmenityRow, lang: string) {
  const isEs = lang === "es";
  return {
    icon: row.icon,
    title: isEs ? row.title_es : row.title_en,
    description: isEs ? row.desc_es : row.desc_en,
  };
}

// ─── Distances ───────────────────────────────────────────────────────────────

export type DistanceRow = {
  id: string;
  place_en: string;
  place_es: string;
  time_en: string;
  time_es: string;
  icon: string;
  sort_order: number;
};

export async function getDistances(propertyId: string): Promise<DistanceRow[]> {
  const { data, error } = await getSupabase()
    .from("distances")
    .select("*")
    .eq("property_id", propertyId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function resolveDistance(row: DistanceRow, lang: string) {
  const isEs = lang === "es";
  return {
    place: isEs ? row.place_es : row.place_en,
    time: isEs ? row.time_es : row.time_en,
    icon: row.icon,
  };
}
