import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { PropertySettings } from "@/lib/domain/property-settings";

// Authenticated (member-only) reads/writes of a property's own settings —
// distinct from lib/dal/public/property.ts, which is the anon-client path
// used by the public site. RLS (properties_select/properties_update, both
// `is_member(org_id)`) and the column-scoped UPDATE grant already restrict
// this to the signed-in user's own org; see
// supabase/migrations/20261016230028_row_level_security_policies.sql.

// For the dashboard's "Sitio" page. Null when the org doesn't have a
// property yet (no provisioning flow exists before SD-603) — the caller
// decides how to handle that, same as lib/dal/organizations.ts#getOrgProperty.
export async function getPropertySettings(
  supabase: SupabaseClient<Database>,
  orgId: string
): Promise<PropertySettings | null> {
  const { data, error } = await supabase
    .from("properties")
    .select(
      "name, whatsapp_number, whatsapp_message_en, whatsapp_message_es, email, maps_url, airbnb_url, address_locality, address_region, address_country, latitude, longitude, meta_title_en, meta_title_es, meta_description_en, meta_description_es, meta_keywords_en, meta_keywords_es, price_range, star_rating, pets_allowed"
    )
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("getPropertySettings failed:", error);
    return null;
  }
  if (!data) return null;

  return {
    name: data.name,
    whatsappNumber: data.whatsapp_number,
    whatsappMessageEn: data.whatsapp_message_en,
    whatsappMessageEs: data.whatsapp_message_es,
    email: data.email,
    mapsUrl: data.maps_url,
    airbnbUrl: data.airbnb_url,
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
  };
}

// The caller (app/app/site/actions.ts) must have already validated `data`
// against propertySettingsSchema and resolved orgId via requireActiveOrg() —
// never from a client-supplied value. `.eq("org_id", orgId)` is defense in
// depth on top of RLS, same reasoning as app/api/admin/content/route.ts's
// equivalent redundant .eq.
export async function updatePropertySettings(
  supabase: SupabaseClient<Database>,
  orgId: string,
  settings: PropertySettings
): Promise<{ ok: true } | { ok: false }> {
  const { data: updated, error } = await supabase
    .from("properties")
    .update({
      name: settings.name,
      whatsapp_number: settings.whatsappNumber,
      whatsapp_message_en: settings.whatsappMessageEn,
      whatsapp_message_es: settings.whatsappMessageEs,
      email: settings.email,
      maps_url: settings.mapsUrl,
      airbnb_url: settings.airbnbUrl,
      address_locality: settings.addressLocality,
      address_region: settings.addressRegion,
      address_country: settings.addressCountry,
      latitude: settings.latitude,
      longitude: settings.longitude,
      meta_title_en: settings.metaTitleEn,
      meta_title_es: settings.metaTitleEs,
      meta_description_en: settings.metaDescriptionEn,
      meta_description_es: settings.metaDescriptionEs,
      meta_keywords_en: settings.metaKeywordsEn,
      meta_keywords_es: settings.metaKeywordsEs,
      price_range: settings.priceRange,
      star_rating: settings.starRating,
      pets_allowed: settings.petsAllowed,
    })
    .eq("org_id", orgId)
    .select("id");

  if (error) {
    console.error("updatePropertySettings failed:", error);
    return { ok: false };
  }
  // RLS filtering a cross-org write already returns 0 rows with no error —
  // without this check (found by security-reviewer), that silently reports
  // success, hiding exactly the case that would reveal an isolation bug or
  // a not-yet-provisioned org (properties.org_id is unique, so this is
  // never legitimately >1 — see the migration adding that constraint).
  if (updated.length !== 1) {
    console.error(`updatePropertySettings: expected 1 row updated for org ${orgId}, got ${updated.length}`);
    return { ok: false };
  }
  return { ok: true };
}
